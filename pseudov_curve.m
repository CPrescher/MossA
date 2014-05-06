function y = pseudov_curve(cs,fwhm,intensity,n,x )
    %UNTITLED Summary of this function goes here
    %   Detailed explanation goes here
    y=n*lorentz_curve(cs,fwhm,intensity,x)+(1-n)*gauss_curve(cs,fwhm,intensity,x);

end

