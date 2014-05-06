function output = lorentz_curve( center, fwhm, intensity, x )
%UNTITLED Summary of this function goes here
%   Detailed explanation goes here

%output=height*(hwhm.^2./((x-center).^2+hwhm.^2));

hwhm=fwhm*0.5;
output=intensity./(pi.*hwhm.*(1+((x-center)./hwhm).^2));
end

