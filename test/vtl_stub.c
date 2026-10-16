/* Test-only mock of the VTL C ABI. This is NOT VocalTractLab. */
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>
int vtlInitialize(const char *path){return path && path[0] ? 0:1;}
int vtlClose(void){return 0;}
int vtlGetConstants(int *sr,int *nt,int *nv,int *ng,int *s,double *isr){
 *sr=44100;*nt=12;*nv=8;*ng=3;*s=220;*isr=200.0;return 0;}
int vtlGetTractParamInfo(char*name,char*desc,char*units,double*lo,double*hi,double*neutral){
 strcpy(name,"JX\tTBX\tTBY\tTTX\tTTY\tLP\tLD\tVO");
 strcpy(desc,"Mock anatomy");strcpy(units,"cm\tcm\tcm\tcm\tcm\tcm\tcm\tcm");
 for(int i=0;i<8;i++){lo[i]=-2;hi[i]=2;neutral[i]=0;}return 0;}
int vtlGetGlottisParamInfo(char*name,char*desc,char*units,double*lo,double*hi,double*neutral){
 strcpy(name,"F0\tPsub\tother");strcpy(desc,"Mock glottis");strcpy(units,"Hz\tPa\t");
 lo[0]=70;hi[0]=500;neutral[0]=120;
 lo[1]=0;hi[1]=10000;neutral[1]=0;
 lo[2]=0;hi[2]=2;neutral[2]=.7;return 0;}
int vtlGetTractParams(const char *name,double *v){
 if(strcmp(name,"a")&&strcmp(name,"i")&&strcmp(name,"u"))return 2;
 for(int j=0;j<8;j++)v[j] = name[0]=='a' ? -.6 : (name[0]=='i' ? 1. : .3);
 return 0;}
int vtlTractToTube(double *v,double*len,double*area,int*art,double*inc,double*tip,double*vel){
 for(int i=0;i<12;i++){len[i]=1.5;area[i]=fmax(.01,2.+v[0]-.04*i);art[i]=i%4;}
 *inc=12.;*tip=0.;*vel=.1;return 0;}
int vtlSynthBlock(double *tract,double *glott,int frames,int step,double *audio,bool enable){
 (void)enable;(void)glott;
 for(int i=0;i<(frames-1)*step;i++)audio[i]=.04*sin(2*3.141592653589793*120*i/44100.0)+.02*tract[0];
 return 0;}
int vtlExportTractSvg(double *tract,const char *path){
 FILE*f=fopen(path,"w");if(!f)return 2;
 fprintf(f,"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 70\"><text x=\"12\" y=\"30\">VTL ABI stub %.2f</text></svg>",tract[0]);fclose(f);return 0;}
