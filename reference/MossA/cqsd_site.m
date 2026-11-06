classdef cqsd_site
    
    properties
        p_i; qs; fwhm; height;
        p_i_error=0; qs_error; fwhm_error;
        line_h;
        %    qs   fwhm  delta1
        fit=[true;true;true];
    end
    
    methods
        function obj=cqsd_site(p_i,qs,fwhm)
            obj.p_i=p_i;
            obj.qs=qs;
            obj.fwhm=fwhm;
        end
        function y=calc(obj,x)
            y=gauss_curve(obj.qs,obj.fwhm,obj.p_i,x);
        end
        function update_h(obj)
           x=get(obj.line_h,'xdata');
           y=obj.calc(x);
           set(obj.line_h,'ydata',y) 
        end
        function delete_h(obj)
           delete(obj.line_h); 
           disp('qsd deleted');
        end
    end
    
end

