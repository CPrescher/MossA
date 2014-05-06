function output = doublet( cs, fwhm, intensity,qs,a12, x )
%UNTITLED Summary of this function goes here
%   Detailed explanation goes here
cs1=cs-qs/2;
cs2=cs+qs/2;

% if length(varargin)==1
%     a12=varargin{1}(1);
% else
%     a12=0.5;
% end

int1=a12*intensity;
int2=(1-a12)*intensity;

output=lorentz_curve(cs1,fwhm,int1,x)+lorentz_curve(cs2,fwhm,int2,x);
end

