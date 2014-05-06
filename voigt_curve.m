function y=voigt_curve(center, fwhm_g,fwhm_l,intensity,x)
%this voigt curve uses the approximation of P. Martin and J. Puerta,
%Applied Optics 20 (1981) 

coeff=[-1.2150  1.2359 -0.3085  0.0210;
       -1.3509  0.3786  0.5906 -1.1858;
       -1.2150 -1.2359 -0.3085 -0.0210;
       -1.3509 -0.3786  0.5906  1.1858];
   
y(1:length(x))=0;

x_par=(x-center)./(fwhm_g.*2.*sqrt(2));
y_par=fwhm_l./(fwhm_g.*2*sqrt(2));

for k=1:4
   y=y+(coeff(k,3).*(y_par-coeff(k,1))  +  coeff(k,4).*(x_par-coeff(k,2)))./...
           ((y_par-coeff(k,1)).^2 + (x_par-coeff(k,2)).^2);
end
y=intensity./(2.*sqrt(2*pi).*fwhm_g)*y;


end

