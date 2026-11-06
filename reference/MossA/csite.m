classdef csite
    properties
       cs;
       cs1;cs2; %cs for doublet and sextet
       cs_error;cs_min;cs_max;
       fwhm;  fwhm_error;   fwhm_min;   fwhm_max;
       intensity=1;   intensity_error;    intensity_max;    intensity_min=0;
       qs=0;    qs_error;     qs_min;     qs_max;
       bhf=0;   bhf_min;      bhf_max;    bhf_error; bhf_s; 
       type=''; height; ta;
       func_type=''; %determines the function type(Lorentzian, Gaussian, PseudoVoigt)
       n; n_error;  % PseudoVoigt parameter for the proportien: n L(x)+ (1-n)*G(x)
       
       %area ratios for the different sites:
       a12=NaN; a12_min=NaN; a12_max=NaN; a12_error=NaN; 
       a13=NaN; a13_min=NaN; a13_max=NaN; a13_error=NaN;
       a12_fit=false; a13_fit=false;
       fit=[true;true;true;true;false;true;false]; %vector which which variables are fitted
       con=[0;0;0;0;0;0;0];
       %it is setted to be true intially for all variables
       
       %line_handle
       line_h;
       
       %xVBF stuff
       fit_method=0;
       qsd_site=([cqsd_site(1,2,0.2)]);
       qsd_site_cur=1;
       qsd_site_num=0;
       
       csd_site=([ccsd_site(1,2,0.2)]);
       csd_site_cur=1;
       csd_site_num=0;
       
       delta1=0; %coupling parameter for QSD distribution
       delta1_fit=1;
       delta1_error;
       
          
    end
    methods
        %constructor
        function obj=csite(cs,fwhm,intensity,line_h)
            obj.cs=cs;
            obj.fwhm=fwhm;
            obj.intensity=intensity;
            obj.line_h=line_h;
            %initiate bounds
            
            data=getappdata(0,'data');
            obj.cs_min=min(data.x);
            if getappdata(0,'ft_fit')
                obj.fwhm_min=0.097;
            else
                obj.fwhm_min=0.194;
            end
            obj.intensity_min=0;
            obj.qs_min=0;
            obj.bhf_min=0;
            
            obj.cs_max=max(data.x);
            obj.fwhm_max=inf;
            obj.intensity_max=inf;
            obj.qs_max=inf;
            obj.bhf_max=inf;
            obj.qsd_site(1)=cqsd_site(1,2,0.2);
        end
        
        %no real destructor function for non-handle classes, so the
        %graphics handle has to be deleted before the class is deleted
        function delete_h(obj)
           delete(obj.line_h); 
           for k=1:obj.qsd_site_num
              obj.qsd_site(k).delete_h();
           end
           for k=1:obj.csd_site_num
               obj.csd_site(k).delete_h();
           end
        end
        
        %set properties
        function obj = set.type(obj,value)
           obj.type=value;
           if strcmp(obj.type, 'Doublet')
              obj.a12=0.5;
              obj.a12_min=0.25;
              obj.a12_max=0.75;
           elseif strcmp(obj.type, 'Sextet')
              obj.qs_min=-inf;
              obj.fit=[1,1,1,0,0,1,0];
              obj.a12=1.5;
              obj.a12_min=0.6;
              obj.a12_max=inf;
              obj.a13=3;               
              obj.a13_min=0;
              obj.a13_max=inf;
           end            
        end
        
        function obj = set.cs(obj,value)
            obj.cs=value;
        end
        
        function obj = set.fwhm(obj,value)
            obj.fwhm=abs(value);                
        end
        
        function obj = set.qs(obj,value)
          if strcmp(obj.type, 'Doublet')
             obj.qs=abs(value);
          else
              obj.qs=value;
          end
        end
               
        
        function obj = set.bhf(obj, value)
            obj.bhf=value;
            obj.bhf_s=value/3.097;
        end
        
        function y = hwhm(obj)
            y=obj.fwhm/2;
        end
        
        
        
        function y=getMatrix(obj)
            y=[obj.fit(1), obj.cs, obj.cs_min, obj.cs_max;
                obj.fit(2), obj.fwhm, obj.fwhm_min, obj.fwhm_max;
                obj.fit(3), obj.intensity, obj.intensity_min, obj.intensity_max];
                
            if strcmp(obj.type, 'Doublet')
                y=[y;obj.fit(4), obj.qs, obj.qs_min, obj.qs_max;
                    obj.fit(5), obj.a12,obj.a12_min, obj.a12_max];
            end
            if strcmp(obj.type,'Sextet')
               y=[y;obj.fit(4), obj.qs, obj.qs_min, obj.qs_max;
                    obj.fit(5), obj.a12,obj.a12_min, obj.a12_max;
                    obj.fit(6), obj.bhf, obj.bhf_min, obj.bhf_max;
                    obj.fit(7), obj.a13,obj.a13_min, obj.a13_max];
            end
        end
       %real functions for plotting
        
        function y=calc(obj,x)
            if strcmp(obj.func_type,'Lorentzian')
                if strcmp(obj.type,'Singlet');
                   y=lorentz_curve(obj.cs,obj.fwhm,obj.intensity,x); 
                end
                if strcmp(obj.type,'Doublet')                    
                    if obj.fit_method==0
                         y=doublet(obj.cs, obj.fwhm, obj.intensity,obj.qs,obj.a12,x);                       
                    elseif obj.fit_method==1
                        y=0; 
                        for k=1:obj.qsd_site_num
                            %line1
                            y=y+voigt_curve(obj.cs+obj.delta1*obj.qsd_site(k).qs+...
                                0.5*obj.qsd_site(k).qs,abs(obj.delta1+0.5)*obj.qsd_site(k).fwhm,...
                                0.194, obj.qsd_site(k).p_i*obj.intensity*0.5,x);
                            %line2:
                            y=y+voigt_curve(obj.cs+obj.delta1*obj.qsd_site(k).qs-...
                                0.5*obj.qsd_site(k).qs,abs(obj.delta1-0.5)*obj.qsd_site(k).fwhm,...
                                0.194, obj.qsd_site(k).p_i*obj.intensity*0.5,x); 
                        end
                    elseif obj.fit_method==2
                        y=0;
                        for cs_n=1:obj.csd_site_num
                            for qs_n=1:obj.qsd_site_num
                             y=y+voigt_curve(obj.csd_site(cs_n).cs+0.5.*obj.qsd_site(qs_n).qs,...   %Center
                                sqrt(obj.csd_site(cs_n).fwhm.^2+0.25.*obj.qsd_site(qs_n).fwhm.^2+...%fwhm_g
                                obj.delta1.*obj.csd_site(cs_n).fwhm.*obj.qsd_site(qs_n).fwhm),...
                                0.194,...                                                          %fwhm_l
                                obj.intensity./2.*obj.csd_site(cs_n).p_i.*obj.qsd_site(qs_n).p_i,x);   %intensity
                            %line2:
                            y=y+voigt_curve(obj.csd_site(cs_n).cs-0.5.*obj.qsd_site(qs_n).qs,...   %Center
                                sqrt(obj.csd_site(cs_n).fwhm.^2+0.25.*obj.qsd_site(qs_n).fwhm.^2-...%fwhm_g
                                obj.delta1.*obj.csd_site(cs_n).fwhm.*obj.qsd_site(qs_n).fwhm),...
                                0.194,...                                                          %fwhm_l
                                obj.intensity./2.*obj.csd_site(cs_n).p_i.*obj.qsd_site(qs_n).p_i,x);   %intensity          
                            end
                        end
                    end
                end
                if strcmp(obj.type,'Sextet')
                    y=sextet(obj.cs, obj.fwhm, obj.intensity, obj.qs,...
                       obj.a12, obj.bhf,obj.a13,x);
                end
            elseif strcmp(obj.func_type,'Gaussian')
                if strcmp(obj.type,'Singlet');
                    y=gauss_curve(obj.cs,obj.fwhm,obj.intensity,x); 
                end
                if strcmp(obj.type,'Doublet');
                    y=doublet_g(obj.cs, obj.fwhm, obj.intensity,obj.qs,obj.a12,x);
                end
                if strcmp(obj.type,'Sextet');
                   y=sextet_g(obj.cs, obj.fwhm, obj.intensity, obj.qs,...
                       obj.a12, obj.bhf,obj.a13,x);
                end  
            elseif strcmp(obj.func_type,'PseudoVoigt')
                if strcmp(obj.type,'Singlet')
                   y=pseudov_curve(obj.cs,obj.fwhm,obj.intensity,obj.n,x); 
                end
                if strcmp(obj.type,'Doublet')
                    y=doublet_p(obj.cs, obj.fwhm, obj.intensity,obj.qs,obj.a12,obj.n,x);
                end
                if strcmp(obj.type,'Sextet')
                    y=sextet_p(obj.cs, obj.fwhm, obj.intensity, obj.qs,...
                       obj.a12, obj.bhf,obj.a13,obj.n,x);
                end  
            elseif strcmp(obj.func_type,'LorSquared')
                if strcmp(obj.type,'Singlet');
                   y=lorentz_squared(obj.cs,obj.fwhm,obj.intensity,x); 
                end
                if strcmp(obj.type,'Doublet')
                    y=doublet_ls(obj.cs, obj.fwhm, obj.intensity,obj.qs,obj.a12,x);
                end   
                if strcmp(obj.type,'Sextet');
                    y=sextet_ls(obj.cs, obj.fwhm, obj.intensity, obj.qs,...
                       obj.a12, obj.bhf,obj.a13,x);         
                end
            end      
        end
        function update_h(obj)
           data=getappdata(0,'data');   
           if ~getappdata(0,'ft_fit')
               line_y=getappdata(0,'I0')-obj.calc(data.x);
           else
               ft_factor=getappdata(0,'ft_factor');
               line_y=getappdata(0,'I0')-obj.calc(data.x)*ft_factor;
           end
           
           set(obj.line_h,'ydata',line_y);
        end
        
        function obj=recalculate_pi(obj)
           sum=0;
           for k=1:obj.qsd_site_num
               sum=sum+obj.qsd_site(k).p_i;               
           end
           
           for k=1:obj.qsd_site_num
               obj.qsd_site(k).p_i=obj.qsd_site(k).p_i./sum; 
               obj.qsd_site(k).p_i_error=obj.qsd_site(k).p_i_error./sum;
               obj.qsd_site(k).update_h();   
           end    
           
           sum=0;
           for k=1:obj.csd_site_num
               sum=sum+obj.csd_site(k).p_i;               
           end
           
           for k=1:obj.csd_site_num
               obj.csd_site(k).p_i=obj.csd_site(k).p_i./sum; 
               obj.csd_site(k).p_i_error=obj.csd_site(k).p_i_error./sum;
               obj.csd_site(k).update_h();   
           end        
        end
        function [cs,qs,pdd]=pdd_calc(obj)
            min_cs=obj.csd_site(1).cs;
            max_cs=obj.csd_site(1).cs;
            for k=1:obj.csd_site_num
               min_cs=min([min_cs;...
                   obj.csd_site(k).cs-3*obj.csd_site(k).fwhm]);
               max_cs=max([max_cs;...
                   obj.csd_site(k).cs+3*obj.csd_site(k).fwhm]);
            end
            min_qs=obj.qsd_site(1).qs;
            max_qs=obj.qsd_site(1).qs;
            for k=1:obj.qsd_site_num
               min_qs=min([min_qs;...
                   obj.qsd_site(k).qs-3*obj.qsd_site(k).fwhm]);
               max_qs=max([max_qs;...
                   obj.qsd_site(k).qs+3*obj.qsd_site(k).fwhm]);
            end
            step_size=(max_cs-min_cs)/250;
            cs=min_cs:step_size:max_cs;
            step_size=(max_qs-min_qs)/250;
            qs=min_qs:step_size:max_qs;
            [cs,qs]=meshgrid(cs,qs);
            
            pdd=zeros(size(cs));
            
            for n_cs=1:obj.csd_site_num
                for n_qs=1:obj.qsd_site_num
                    pdd=pdd+obj.csd_site(n_cs).p_i.*obj.qsd_site(n_qs).p_i./...
                        (2.*pi.*obj.csd_site(n_cs).fwhm.*obj.qsd_site(n_qs).fwhm.*...
                        sqrt(1-obj.delta1.^2)).*exp(-1./(2.*(1-obj.delta1.^2)).*...
                        ((cs-obj.csd_site(n_cs).cs).^2./obj.csd_site(n_cs).fwhm.^2+...
                        (qs-obj.qsd_site(n_qs).qs).^2./obj.qsd_site(n_qs).fwhm.^2+...                        
                        -2.*obj.delta1.*(cs-obj.csd_site(n_cs).cs).*(qs-obj.qsd_site(n_qs).qs)./...
                        (obj.csd_site(n_cs).fwhm.*obj.qsd_site(n_qs).fwhm)));
                end                
            end                      
        end
    end    
end
