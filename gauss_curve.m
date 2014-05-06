function y = gauss_curve( cs,fwhm,intensity,x  )
%GAUSS Summary of this function goes here
%   
    hwhm=fwhm/2;
    y=intensity*0.8326/(hwhm*1.7725)*exp(-(x-cs).^2/(hwhm/0.8326)^2);

end

