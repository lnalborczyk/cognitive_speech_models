"""Minimal standard-library ctypes bridge to the official VocalTractLab C API.

API checked against TUD-STKS/VocalTractLabBackend-dev/include/
VocalTractLabApi/VocalTractLabApi.h (retrieved 2026-10-16).
This does NOT distribute VTL itself or imply that this wrapper has been
verified with a locally available native library.
"""
from __future__ import annotations
import base64
import ctypes as ct
import io
import math
import os
from pathlib import Path
import struct
import tempfile
import wave

D = ct.c_double
I = ct.c_int
P = ct.POINTER


class VTLError(RuntimeError):
    pass


def _check(code, operation):
    if code:
        raise VTLError(f"{operation} failed (VTL error code {code})")


def encode_wav(values, rate):
    """Uncompressed 16-bit PCM mono WAV, returned as base64."""
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        pcm = (max(-32768, min(32767, round(float(x)*32767)))
               for x in values)
        wav.writeframes(struct.pack('<' + 'h'*len(values), *pcm))
    return base64.b64encode(stream.getvalue()).decode('ascii')


class VocalTractLab:
    def __init__(self, library_path: str, speaker_path: str):
        path=Path(library_path).expanduser().resolve()
        speaker=Path(speaker_path).expanduser().resolve()
        if not path.is_file():
            raise VTLError(f"VTL shared library not found: {path}")
        if not speaker.is_file():
            raise VTLError(f"VTL speaker file not found: {speaker}")
        self.lib=ct.CDLL(str(path))
        self._signatures()
        _check(self.lib.vtlInitialize(os.fsencode(speaker)), 'vtlInitialize')
        try:
            self._init_metadata()
        except Exception:
            self.lib.vtlClose()
            raise

    def _signatures(self):
        def register(name, args):
            func=getattr(self.lib,name)
            func.argtypes=args
            func.restype=I
        register('vtlInitialize',[ct.c_char_p])
        register('vtlClose',[])
        register('vtlGetConstants',[P(I),P(I),P(I),P(I),P(I),P(D)])
        fields=[ct.c_char_p,ct.c_char_p,ct.c_char_p,P(D),P(D),P(D)]
        register('vtlGetTractParamInfo',fields)
        register('vtlGetGlottisParamInfo',fields)
        register('vtlGetTractParams',[ct.c_char_p,P(D)])
        register('vtlTractToTube',[P(D),P(D),P(D),P(I),P(D),P(D),P(D)])
        register('vtlSynthBlock',[P(D),P(D),I,I,P(D),ct.c_bool])
        register('vtlExportTractSvg',[P(D),ct.c_char_p])

    def _info(self, name, n):
        labels=ct.create_string_buffer(10*n+512)
        descriptions=ct.create_string_buffer(100*n+512)
        units=ct.create_string_buffer(10*n+512)
        low=(D*n)(); high=(D*n)(); neutral=(D*n)()
        _check(getattr(self.lib,name)(labels,descriptions,units,low,high,neutral),name)
        # Names in VTL are tab-delimited.
        parsed=[x.strip() for x in labels.value.decode('utf-8',errors='replace').split('\t')]
        if len(parsed)!=n:
            parsed=[f'parameter_{i}' for i in range(n)]
        return {'names':parsed, 'min':list(low),'max':list(high),'neutral':list(neutral),
                'units':units.value.decode('utf-8',errors='replace').split('\t')}

    def _init_metadata(self):
        rate=I(); ntube=I(); ntract=I(); nglottis=I(); step=I(); internal=D()
        _check(self.lib.vtlGetConstants(ct.byref(rate),ct.byref(ntube),ct.byref(ntract),
            ct.byref(nglottis),ct.byref(step),ct.byref(internal)), 'vtlGetConstants')
        self.rate=rate.value;self.ntube=ntube.value;self.ntract=ntract.value
        self.nglottis=nglottis.value
        self.tract=self._info('vtlGetTractParamInfo',self.ntract)
        self.glottis=self._info('vtlGetGlottisParamInfo',self.nglottis)
        if self.rate<8000 or self.ntract<1 or self.nglottis<2:
            raise VTLError('Unexpected VTL API metadata')
        self.shapes={}
        self.shape_sources={}
        def lookup(key, source):
            values=(D*self.ntract)()
            code=self.lib.vtlGetTractParams(source.encode('ascii'),values)
            if code==0:
                self.shapes[key]=[self._normalize(values[i],i) for i in range(self.ntract)]
                self.shape_sources[key]=source
        for phone in ('a','i','u'):
            lookup(phone,phone)
        for phone,base in (('p','ll-labial-closure'),('t','tt-alveolar-closure'),('k','tb-velar-closure')):
            for vowel in ('a','i','u'):
                lookup(f'{phone}:{vowel}',f'{base}({vowel})')
            if f'{phone}:a' in self.shapes:
                self.shapes[phone]=self.shapes[f'{phone}:a']
                self.shape_sources[phone]=self.shape_sources[f'{phone}:a']
        if not all(p in self.shapes for p in ('a','i')):
            raise VTLError("Speaker must contain VTL-defined 'a' and 'i' shapes")

    def _normalize(self,x,i):
        lo=self.tract['min'][i]; hi=self.tract['max'][i]
        return max(0,min(1,(x-lo)/(hi-lo))) if hi>lo else 0

    def _denormalize(self, values):
        if len(values)!=self.ntract:raise VTLError(f"Expected {self.ntract} tract parameters")
        return [(self.tract['min'][j]+max(0,min(1,float(v)))*
            (self.tract['max'][j]-self.tract['min'][j])) for j,v in enumerate(values)]

    def info(self):
        return {'kind':'vtl','engine':'VocalTractLab native (research model)',
                'names':self.tract['names'],'labels':self.tract['names'],
                'min':self.tract['min'],'max':self.tract['max'],
                'neutral':[self._normalize(v,i) for i,v in enumerate(self.tract['neutral'])],
                'shapes':self.shapes,'shapeSources':self.shape_sources,'rate':self.rate,'isNative':True,
                'units':self.tract['units'],'tubeSections':self.ntube,
                'glottisNames':self.glottis['names']}

    def synthesize(self, frames, *, include_geometry=True, geometry_fps=24, reference_targets=None):
        if len(frames)<2 or len(frames)>1800:raise VTLError('Provide 2 to 1800 frames')
        if not isinstance(geometry_fps, int) or not 5 <= geometry_fps <= 30:
            raise VTLError('geometry_fps must be an integer between 5 and 30')
        times=[float(f['t']) for f in frames]
        if abs(times[0])>1e-5 or any(not math.isfinite(t) for t in times):
            raise VTLError('Frame times must start at zero and be finite')
        steps=[times[i]-times[i-1] for i in range(1,len(times))]
        if min(steps)<=0 or max(steps)-min(steps)>1e-5:
            raise VTLError('Frames must be sampled at a fixed positive step')
        step_samples=round(steps[0]*self.rate)
        if step_samples<=0 or step_samples>self.rate//10:
            raise VTLError('Unsupported sampling step')
        n=len(frames)
        tract_flat=[];glottis_flat=[]
        poses=[]
        for idx,f in enumerate(frames):
            if not isinstance(f.get('x'),list) or any(not isinstance(v,(int,float)) or not math.isfinite(v)
                for v in f['x']):raise VTLError('Non-finite articulatory state')
            tract=self._denormalize(f['x'])
            poses.append(tract)
            tract_flat.extend(tract)
            # Glottis parameters are speaker-specific; initialize to its neutral.
            glott=self.glottis['neutral'].copy()
            glott[0]=max(self.glottis['min'][0],min(self.glottis['max'][0],120.))
            # Smooth pressure ramp at start/end. Refer to VTL example4.py.
            fraction=min(1,idx/12,(n-1-idx)/12)
            glott[1]=max(self.glottis['min'][1],min(self.glottis['max'][1],8000*max(0,fraction)))
            glottis_flat.extend(glott)
        tract_c=(D*len(tract_flat))(*tract_flat)
        glottis_c=(D*len(glottis_flat))(*glottis_flat)
        naudio=(n-1)*step_samples
        audio=(D*naudio)()
        _check(self.lib.vtlSynthBlock(tract_c,glottis_c,n,step_samples,audio,False),'vtlSynthBlock')
        # VTL geometry and cross-sectional tube areas are calculated by the
        # VTL geometry engine, not by a browser approximation.
        # Export an animation of the *actual* VTL geometry at a regular
        # visual sampling rate. The browser renders these precomputed SVGs
        # at the audio playhead time; this is synchronized playback, not a
        # per-animation-frame native simulation or a WebAssembly build.
        samples=[]; svgs=[]; missing=0
        frame_count=min(n, 120, max(2, math.ceil(times[-1]*geometry_fps)+1))
        indices=sorted(set(round(i*(n-1)/(frame_count-1)) for i in range(frame_count)))
        total_svg_bytes=0
        if include_geometry:
            svg_tmp=tempfile.TemporaryDirectory(prefix='cognitive_speech_vtl_')
        else:
            svg_tmp=None
        try:
            for idx in indices:
                pose=(D*self.ntract)(*poses[idx]); length=(D*self.ntube)(); area=(D*self.ntube)()
                articulators=(I*self.ntube)(); incisors=D(); tip=D(); velum=D()
                _check(self.lib.vtlTractToTube(pose,length,area,articulators,
                    ct.byref(incisors),ct.byref(tip),ct.byref(velum)),'vtlTractToTube')
                samples.append({'t':times[idx], 'lengths_cm':list(length),'areas_cm2':list(area),
                    'articulators':list(articulators),'velum_area_cm2':velum.value})
                if include_geometry:
                    # VTL emits its anatomical SVG, never a browser-invented
                    # interpretation of the 19 (or more) tract parameters.
                    output=Path(svg_tmp.name)/f'tract_{idx:05d}.svg'
                    if self.lib.vtlExportTractSvg(pose,os.fsencode(output))==0 and output.is_file():
                        content=output.read_bytes()
                        if 0 < len(content) <= 750_000 and total_svg_bytes+len(content)<=18_000_000:
                            total_svg_bytes+=len(content)
                            svgs.append({'t':times[idx],
                                'svgBase64':base64.b64encode(content).decode('ascii')})
                        else:
                            missing+=1
                    else:
                        missing+=1
        finally:
            if svg_tmp is not None:svg_tmp.cleanup()
        # Reference tube geometry from actual VTL target shapes, not interpolation.
        # These are static targets, NOT a VTL-generated gestural score or time series.
        diagnostic_geometry=[]
        # Tube-only snapshots at ~100 Hz for stop timing, independent of SVG fps.
        if reference_targets:
            count=min(n,500,math.ceil(times[-1]*100)+1)
            sample_indices=sorted(set(round(i*(n-1)/max(1,count-1)) for i in range(count)))
            for idx in sample_indices:
                pose=(D*self.ntract)(*poses[idx]);length=(D*self.ntube)();area=(D*self.ntube)()
                which=(I*self.ntube)();incisor=D();tip=D();velum=D()
                _check(self.lib.vtlTractToTube(pose,length,area,which,
                    ct.byref(incisor),ct.byref(tip),ct.byref(velum)),
                    'vtlTractToTube (diagnostics)')
                diagnostic_geometry.append({'t':times[idx],
                    'lengths_cm':list(length),'areas_cm2':list(area)})
        references=[]
        for item in (reference_targets or [])[:12]:
            values=item.get('x') if isinstance(item,dict) else None
            if not isinstance(values,list) or len(values)!=self.ntract:
                raise VTLError('Invalid reference target')
            pose=(D*self.ntract)(*self._denormalize(values))
            lengths=(D*self.ntube)();areas=(D*self.ntube)();which=(I*self.ntube)()
            incisor=D();tip=D();velum=D()
            _check(self.lib.vtlTractToTube(pose,lengths,areas,which,ct.byref(incisor),ct.byref(tip),ct.byref(velum)),
                'vtlTractToTube (reference)')
            references.append({'phone':str(item.get('phone',''))[:4],
                'context':str(item.get('context',''))[:4],
                'source':str(item.get('source',''))[:100],
                'lengths_cm':list(lengths),'areas_cm2':list(areas)})
        warnings=['Controller commands and actuator dynamics remain conceptual; native VTL provides geometry, area functions, and acoustic synthesis.']
        if missing:
            warnings.append(f'{missing} SVG geometry frames were unavailable or exceeded the size budget.')
        return {'kind':'vtl','sampleRate':self.rate,'audioBase64':encode_wav(list(audio),self.rate),
                'geometry':samples,'diagnosticGeometry':diagnostic_geometry,'references':references,'svgs':svgs,'geometryFps':geometry_fps,
                'numberAudioSamples':naudio, 'nominalDuration':times[-1],
                'audioDuration':naudio/self.rate,'warnings':warnings}

    def close(self):
        if self.lib is not None:
            self.lib.vtlClose()
            self.lib=None
