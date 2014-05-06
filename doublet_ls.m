function output = doublet_ls( cs, fwhm, factor,qs,a12, x)
%UNTITLED Summary of this function goes here
%   Detailed explanation goes here
cs1=cs-qs/2;
cs2=cs+qs/2;

int1=a12*factor;
int2=(1-a12)*factor;

output=lorentz_squared(cs1,fwhm,int1,x)+lorentz_squared(cs2,fwhm,int2,x);
end

