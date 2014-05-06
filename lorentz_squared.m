function output = lorentz_squared( center, fwhm, intensity, x )
%UNTITLED Summary of this function goes here
%   Detailed explanation goes here

hwhm=fwhm/2;
output=intensity.*hwhm*2*pi*(1./(pi.*hwhm.*(1+((x-center)/hwhm).^2))).^2;
end

