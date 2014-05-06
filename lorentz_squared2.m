function output = lorentz_squared2( center, fwhm, intensity, x )
%UNTITLED Summary of this function goes here
%   Detailed explanation goes here

output=intensity.*fwhm*pi*((fwhm./(2*pi))./((x-center).^2+(fwhm./2).^2)).^2;
end

