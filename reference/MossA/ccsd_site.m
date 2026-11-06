classdef ccsd_site
    
    properties
        p_i; cs; fwhm; height;
        p_i_error=0; cs_error; fwhm_error;
        line_h;
        %    qs   fwhm  delta1
        fit=[true;true;true];
    end
    
    methods
        function obj=ccsd_site(p_i,cs,fwhm)
            obj.p_i=p_i;
            obj.cs=cs;
            obj.fwhm=fwhm;
        end
        function y=calc(obj,x)
            y=gauss_curve(obj.cs,obj.fwhm,obj.p_i,x);
        end
        function update_h(obj)
           x=get(obj.line_h,'xdata');
           y=obj.calc(x);
           set(obj.line_h,'ydata',y) 
        end
        function delete_h(obj)
           delete(obj.line_h); 
           disp('csd deleted');
        end
    end
    
end

