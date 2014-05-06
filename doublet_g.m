function output = doublet_g( cs, fwhm, intensity,qs,a12, x)
%UNTITLED Summary of this function goes here
%   Detailed explanation goes here
cs1=cs-qs/2;
cs2=cs+qs/2;

int1=a12*intensity;
int2=(1-a12)*intensity;

output=gauss_curve(cs1,fwhm,int1,x)+gauss_curve(cs2,fwhm,int2,x);
end

