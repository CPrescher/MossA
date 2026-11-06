classdef cft_fit
    %cfit capsulates all the fitting of MossA, for a better readability
    %etc. and maintenance
    %   Detailed explanation goes here
    
    properties
        %general poperties
        param_num; bkg_order; fwhm_s; 
        sites; %array of all the sites to fit
        sites_num; %number of sites
        status; %fitting status or error bar
        output_txt; %handle for the text output
        output_graph;
        param; residual;
        x_dummy=-30:0.01:30;
        %fitting properties
        func_str; %gesamter string zum darstellen der Fkt.
        bkg_str; %stellt nur die Bkg function dat
        bkg_model;
        ta_str; % stellt nur die thin absorber approximation dar
        model;
        ta_model;
        ub=[]; lb=[]; ival=[]; %upper and lower boundaries, inital valus
        errors; % array with error values for every fitting parameter
        
        %constraints array
        con_val=[]; %will save the l values of the var1 in var2=fac*var1;
        Aeq;
        beq;
        
        %strings for every site and function for every site:)
        site_str;
        site_func;
    end
    
    methods
        %constructor
        function obj=cft_fit(output_txt,output_graph, sites, polynom_type,fwhm_s)
           obj.sites=sites;
           obj.output_txt=output_txt;
           obj.output_graph=output_graph;
           obj.sites_num=length(sites);
           obj.bkg_order=polynom_type;
           obj.fwhm_s=fwhm_s;
           
        end
        
        
        %%************************************************************
        %%build iniial values and upper and lower boundaries +model
        %%function
        %************************************************************
        
        function obj=start(obj)
            obj.bkg_str='';
            obj.ub=[inf];
            obj.lb=[-inf];
            obj.ival=[getappdata(0,'I0')];
            l=2;
            
            bkg_param=getappdata(0, 'bkg_param');
            
            %**************************************************************
            %*****************background order ***************************
            %************************************************************
            for n=2:obj.bkg_order
               obj.bkg_str=[obj.bkg_str, '-x(',int2str(l),')*xdata.^',int2str(n-1)];
               obj.ub=[obj.ub; inf];
               obj.lb=[obj.lb; -inf];
               obj.ival=[obj.ival;  bkg_param(n)];
               l=l+1;
            end  

            if obj.bkg_order>=2
                obj.bkg_str=['@(x,xdata)(',obj.bkg_str,')'];
                obj.bkg_model=eval(obj.bkg_str);
            end
            
            %linear constraints initialisation
            lcon_counter=1;
            cs_pi_lcon{lcon_counter}=[];
            qs_pi_lcon{lcon_counter}=[];
            obj.Aeq=[];
            obj.beq=[];
            
            %**************************************************************
            %*******************normal fitting*****************************
            %**************************************************************
            obj.ta_str='';
            con_matrix=getappdata(0,'con_matrix'); %loading constraints matrix
            con_num=getappdata(0,'con_num');
            
            obj.site_str=cell(obj.sites_num);
            
            for k=1:obj.sites_num
                matrix=obj.sites(k).getMatrix();
                dim=size(matrix,1);
                if obj.sites(k).fit_method==0;
                    if strcmp(obj.sites(k).func_type,'Lorentzian')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='+lorentz_curve(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='+doublet(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                            obj.site_str{k}='+sextet(';
                        end;
                    elseif strcmp(obj.sites(k).func_type,'Gaussian')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='+gauss_curve(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='+doublet_g(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                            obj.site_str{k}='+sextet_g(';
                        end;
                    elseif strcmp(obj.sites(k).func_type,'PseudoVoigt')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='+pseudov_curve(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='+doublet_p(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                           obj.site_str{k}='+sextet_p(';
                        end;
                    elseif strcmp(obj.sites(k).func_type,'LorSquared')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='+lorentz_squared(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='+doublet_ls(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                            obj.site_str{k}= '+sextet_ls(';
                        end
                    end


                    %setting up cs, hwhm, int and qs/bhf
                    con=obj.sites(k).con;
                    for n=1:dim
                       if matrix(n,1)
                           for m=1:con_num
                              if con_matrix(m,1)==k && con_matrix(m,2)==n
                                  %this means that this variable is in the
                                  %constraint m and the index will be saved in
                                  %con_indices_var1 by index number
                                  obj.con_val(m)=l;
                              end
                           end
                           if con(n)<=0
                              %no constraint for this variable
                              obj.site_str{k}=[obj.site_str{k},'x(',int2str(l),'),'];
                              obj.ival=[obj.ival; matrix(n,2)];
                              obj.lb=[obj.lb; matrix(n,3)];
                              obj.ub=[obj.ub; matrix(n,4)];
                              l=l+1;                         
                           elseif con(n)>0
                              %variable is defined as var2 in var2=factor var1
                              %con(n) gives the number of the constraint and
                              %con_factor is an array with the factors for each
                              %constraint    
                              obj.site_str{k}=[obj.site_str{k},num2str(con_matrix(con(n),5)),...
                                  '*x(',int2str(obj.con_val(con(n))),'),'];
                           end                          
                       else
                          obj.site_str{k}=[obj.site_str{k},num2str(matrix(n,2)),','];
                       end
                    end

                    %concerning about the pseudoVoigt factor
                    if strcmp(obj.sites(k).func_type, 'PseudoVoigt')
                        obj.site_str{k}=[obj.site_str{k},'x(',int2str(l),'),'];
                        obj.lb=[obj.lb; 0];
                        obj.ub=[obj.ub; 1];
                        obj.ival=[obj.ival; 0.5];
                        l=l+1;
                    end
                
                    obj.site_str{k}=[obj.site_str{k},'obj.x_dummy)']; 
                    
                elseif obj.sites(k).fit_method==2 %xVBF fit 
                    
                    start_index=l;
                    l=l+2;
                                        
                    %short explanations of the meanings of variables:
                    %start_index   - delta1 corrleation parameter
                    %start_index+1 - Intensity
                   
                    %initiate ival and boundaries for delta1:
                    obj.ival=[obj.ival; obj.sites(k).delta1];
                    if obj.sites(k).qsd_site(1).fit(3)
                        obj.lb=[obj.lb; -1];
                        obj.ub=[obj.ub; 1];
                    else
                        obj.lb=[obj.lb; obj.sites(k).delta1-eps];
                        obj.ub=[obj.ub; obj.sites(k).delta1+eps];                  
                    end
                    
                    %initiate ival and boundaries for intensity:
                    obj.ival=[obj.ival; obj.sites(k).intensity];
                    obj.lb=[obj.lb; 0];
                    obj.ub=[obj.ub; inf];
                    
                   
                    %initiate variables, ival, and boundaries
                    cs_index=zeros(1,obj.sites(k).csd_site_num);
                    cs_fwhm_index=zeros(1,obj.sites(k).csd_site_num);
                    cs_pi_index=zeros(1,obj.sites(k).csd_site_num);
                    for n_cs=1:obj.sites(k).csd_site_num
                        cs_index(n_cs)=l;
                        cs_fwhm_index(n_cs)=l+1;
%                         cs_pi_index(n_cs)=l+2;
                        
%                         obj.param_type{l+2}=['cspi',num2str(xVBF_sites_num)];
                        
                        l=l+2;
                        %cs
                        obj.ival=[obj.ival; obj.sites(k).csd_site(n_cs).cs];
                        if obj.sites(k).csd_site(n_cs).fit(1)
                            obj.lb=[obj.lb; obj.sites(k).cs_min];
                            obj.ub=[obj.ub; obj.sites(k).cs_max];
                        else
                            obj.lb=[obj.lb; obj.sites(k).csd_site(n_cs).cs-eps];
                            obj.ub=[obj.ub; obj.sites(k).csd_site(n_cs).cs+eps];
                        end
                        
                        %cs_width                        
                        obj.ival=[obj.ival; obj.sites(k).csd_site(n_cs).fwhm];
                        if obj.sites(k).csd_site(n_cs).fit(2)
                            obj.lb=[obj.lb; obj.sites(k).fwhm_min];
                            obj.ub=[obj.ub; obj.sites(k).fwhm_max];
                        else
                            obj.lb=[obj.lb; obj.sites(k).csd_site(n_cs).fwhm-eps];
                            obj.ub=[obj.ub; obj.sites(k).csd_site(n_cs).fwhm+eps];
                        end
                        
%                         %cs_pi
%                         obj.ival=[obj.ival; obj.sites(k).csd_site(n_cs).p_i];
%                         obj.lb=[obj.lb; 0];
%                         obj.ub=[obj.ub; 1];
                    end
                    
                    qs_index=zeros(1,obj.sites(k).qsd_site_num);
                    qs_fwhm_index=zeros(1,obj.sites(k).qsd_site_num);
                    qs_pi_index=zeros(1,obj.sites(k).qsd_site_num);
                    for n_qs=1:obj.sites(k).qsd_site_num
                        qs_index(n_qs)=l;
                        qs_fwhm_index(n_qs)=l+1;
%                         qs_pi_index(n_qs)=l+2;
                        
%                         obj.param_type{l+2}=['qspi',num2str(xVBF_sites_num)];
                        
                        l=l+2;
                        %qs
                        obj.ival=[obj.ival; obj.sites(k).qsd_site(n_qs).qs];
                        if obj.sites(k).qsd_site(n_qs).fit(1)
                            obj.lb=[obj.lb; obj.sites(k).qs_min];
                            obj.ub=[obj.ub; obj.sites(k).qs_max];
                        else
                            obj.lb=[obj.lb; obj.sites(k).qsd_site(n_qs).qs-eps];
                            obj.ub=[obj.ub; obj.sites(k).qsd_site(n_qs).qs+eps];
                        end
                        
                        %qs_width                        
                        obj.ival=[obj.ival; obj.sites(k).qsd_site(n_qs).fwhm];
                        if obj.sites(k).qsd_site(n_qs).fit(2)
                            obj.lb=[obj.lb; obj.sites(k).fwhm_min];
                            obj.ub=[obj.ub; obj.sites(k).fwhm_max];
                        else
                            obj.lb=[obj.lb; obj.sites(k).qsd_site(n_qs).fwhm-eps];
                            obj.ub=[obj.ub; obj.sites(k).qsd_site(n_qs).fwhm+eps];
                        end
                        
                        %qs_pi
%                         obj.ival=[obj.ival; obj.sites(k).qsd_site(n_qs).p_i];
%                         obj.lb=[obj.lb; 0];
%                         obj.ub=[obj.ub; 1];
                    end
                    
                     %initiation of the Aeq=b linear conditions:
                    
%                     cs_pi_lcon{lcon_counter}=cs_pi_index;
%                     qs_pi_lcon{lcon_counter}=qs_pi_index;
                    
                    
                    
                    
                    obj.site_str{k}='';
                    for n_cs=1:obj.sites(k).csd_site_num    
                        for n_qs=1:obj.sites(k).qsd_site_num;    
                            %first void:
                            %defining the center with QS dependence
                            obj.site_str{k}=[obj.site_str{k},'+voigt_curve('];
                            obj.site_str{k}=[obj.site_str{k},'x(',int2str(cs_index(n_cs)),...
                                ')+0.5*x(',int2str(qs_index(n_qs)),'),'];

                            %defining the width of the gaussian peak:
                            obj.site_str{k}=[obj.site_str{k},'sqrt(x(',...
                                int2str(cs_fwhm_index(n_cs)),').^2+0.25*x(',...
                                int2str(qs_fwhm_index(n_qs)),').^2+x(',...
                                int2str(start_index),')*x(',...
                                int2str(cs_fwhm_index(n_cs)),')*x(',...
                                int2str(qs_fwhm_index(n_qs)),')),'];

                            %natural linewidth of the Lorentzian
                            obj.site_str{k}=[obj.site_str{k},'0.194,'];

                            %intensity
%                             obj.site_str{k}=[obj.site_str{k},'x(',...
%                                 int2str(cs_pi_index(n_cs)),')*x(',...
%                                 int2str(qs_pi_index(n_qs)),')*x(',...
%                                 int2str(start_index+1),')*0.5,'];
                            obj.site_str{k}=[obj.site_str{k},'x(',...
                                int2str(start_index+1),')*0.5,'];
                                

                            obj.site_str{k}=[obj.site_str{k},'xdata)']; 
                            
                            %**************************************************
                            %*****************second void curve ***************
                            %**************************************************
                            obj.site_str{k}=[obj.site_str{k},'+voigt_curve('];
                            obj.site_str{k}=[obj.site_str{k},'x(',int2str(cs_index(n_cs)),...
                                ')-0.5*x(',int2str(qs_index(n_qs)),'),'];

                            %defining the width of the gaussian peak:
                            obj.site_str{k}=[obj.site_str{k},'sqrt(x(',...
                                int2str(cs_fwhm_index(n_cs)),').^2+0.25*x(',...
                                int2str(qs_fwhm_index(n_qs)),').^2-x(',...
                                int2str(start_index),')*x(',...
                                int2str(cs_fwhm_index(n_cs)),')*x(',...
                                int2str(qs_fwhm_index(n_qs)),')),'];

                            %natural linewidth of the Lorentzian
                            obj.site_str{k}=[obj.site_str{k},'0.194,'];

                            %intensity
%                             obj.site_str{k}=[obj.site_str{k},'x(',...
%                                 int2str(cs_pi_index(n_cs)),')*x(',...
%                                 int2str(qs_pi_index(n_qs)),')*x(',...
%                                 int2str(start_index+1),')*0.5,'];
                            obj.site_str{k}=[obj.site_str{k},'x(',...
                                int2str(start_index+1),')*0.5,'];

                            obj.site_str{k}=[obj.site_str{k},'xdata)']; 
                        end  
                    end
                    lcon_counter=lcon_counter+1;
                end
%                 if lcon_counter~=1
%                     obj.Aeq=zeros(2*(lcon_counter-1),l-1);
%                     obj.beq=ones(2*(lcon_counter-1),1);
%                     for n=1:lcon_counter-1
%                         obj.Aeq(2*n-1,qs_pi_lcon{n})=1;
%                         obj.Aeq(2*n,cs_pi_lcon{n})=1;                
%                     end
%                 end
                %save the str in the thin-absorber approximation string
                obj.ta_str=[obj.ta_str,obj.site_str{k}];

                %create model functions:
                str=['@(x,xdata)(',obj.site_str{k},')'];  
                str=strrep(str,'obj.x_dummy','xdata');
                obj.site_func{k}=eval(str);
                
            end
            obj.ta_str=['(',obj.ta_str,')'];            
            obj.ta_str=['@(x,xdata)(',obj.ta_str,')'];  
            obj.ta_str
            obj.ta_model=eval(obj.ta_str);
        end %build
        
        function stop = outfun(obj, x, optimValues,state)
            stop = false;
            switch state
            case 'init'
               hold on
            case 'iter'
                data=getappdata(0,'data');
                
                str=cellstr(get(obj.output_txt, 'String'));
                chi_square=sum((data.y-obj.model_func(x,data.x)).^2./data.y)./length(data.x);
                             
                str=[str; cellstr(sprintf('       %d \t %2.6f',...
                     optimValues.iteration,chi_square))];
                 
                if length(str)>8
                    new_str=str(2:9);
                    str=new_str;
                end
                set(obj.output_txt, 'String',str);
                
                %plot the steps in between:
                
                bkg=ones(1,length(data.x))*x(1);
                if obj.bkg_order>=2
                    bkg=bkg+obj.bkg_model(x,data.x);
                end
                set(getappdata(0,'bkg_h'),'ydata',bkg);
               
                %sites
                ft_factor=getappdata(0,'ft_factor');
                site=getappdata(0,'site_data');
                for k=1:obj.sites_num
                    y=x(1)-ft_factor*obj.site_func{k}(x,data.x);
                    set(site(k).line_h,'ydata',y);
                end
                             
                %model
                set(getappdata(0,'sum_h'),'ydata',obj.model_func(x,data.x));
                
                drawnow;
                stop=getappdata(0,'stop_fitting');
            case 'done'
               str=cellstr(get(obj.output_txt, 'String'));
               str=[str; cellstr('       End fitting')];
               if length(str)>8
                    new_str=str(2:9);
                    str=new_str;
               end
               set(obj.output_txt, 'String',str);
               hold off
           otherwise
           end        
        end %outfun    
        
        function y=model_func(obj,x,xdata)
            if getappdata(0, 'ft_lor2')
               y1=lorentz_squared(0,obj.fwhm_s,1,obj.x_dummy); 
            else               
               y1=lorentz_curve(0,obj.fwhm_s,1,obj.x_dummy); 
            end                      
            
            y2=exp(-(obj.ta_model(x,obj.x_dummy)));
            
            y_model=conv(y1,y2,'same');
            
            y_model=pchip(obj.x_dummy, y_model,xdata); %interpolate between 
            %the even spaced convolution to obtain data for the uneven
            %spaced x_data of the experimental data.
            y_model=x(1)/100*(y_model); %multiply with I0
            
            %if there is a square or linear distortion in the spectrum:
            if obj.bkg_order>=2
                bkg=obj.bkg_model(x,xdata);     
                y_model=y_model+bkg;
            end
           
            y=y_model;
        end
        
        function rrms=model_func2(obj,x)
            data=getappdata(0,'data');
            res=(data.y-obj.model_func(x,data.x)).^2./length(data.x);
            rrms=sum(res);
        end
        
        function [sites, table, residual, y]=process(obj)
                      
            obj=obj.start();
            options=optimset('OutputFcn', @obj.outfun);
            
            data=getappdata(0,'data');
            solver=getappdata(0,'solver');
            if strcmp(solver,'lsqcurvefit') 
                [obj.param,~,residual,~,~,~,jacobian] = ...
                   lsqcurvefit(@obj.model_func, obj.ival, data.x, data.y, ...
                   obj.lb, obj.ub, options);

                %ask if it was stopped by the user
                if ~getappdata(0,'stop_fitting');
                    if strcmp(getappdata(0,'error'),'1sigma')
                        error_vals=nlparci(obj.param, residual,'jacobian', jacobian,'alpha',0.683);
                    else
                        error_vals=nlparci(obj.param, residual,'jacobian', jacobian);
                    end
                    obj.errors=zeros(length(error_vals),1);
                    for k=1:length(error_vals)
                      obj.errors(k)=(error_vals(k,2)-error_vals(k,1))/2; 
                    end
                    %**************************************************************
                    %calculation of the ft_factor for plotting the sites otherwise 
                    %their intensity would be much to low to see them in the normal 
                    %plot window 

                    ft_factor=(obj.param(1)-min(data.y))/max(obj.ta_model(obj.param,obj.x_dummy))*0.8;


                    setappdata(0,'ft_factor', ft_factor);
                    %**********************************************************
                    %****
                    [sites, table]=output(obj, obj.param, obj.errors);
                    y=obj.model_func(obj.param,data.x)';   
                else
                    sites=obj.sites;
                    table=zeros(obj.sites_num, 17);
                    residual=NaN;
                    y=NaN;
                end        
            elseif strcmp(solver,'fmincon')
                options=optimset('OutputFcn', @obj.outfun,'MaxFunEvals', 7000,...
                    'algorithm','interior-point','DiffMaxChange', 0.05);
%                 [obj.param,~,~,~,~,~,~] = ...
%                    fmincon(@obj.model_func2, obj.ival, [],[],obj.Aeq,obj.beq, ...
%                    obj.lb, obj.ub,[],options);
                  [obj.param,~,~,~,~,~,~] = ...
                   fmincon(@obj.model_func2, obj.ival, [],[],[],[], ...
                   obj.lb, obj.ub,[],options);
                residual=data.y-obj.model_func(obj.param,data.x);
                if ~getappdata(0,'stop_fitting');
                    jacobian=calcJacobian(@obj.model_func,obj.param,data.x,1e-3);
                    if strcmp(getappdata(0,'error'),'1sigma')
                        error_vals=nlparci(obj.param, residual,'jacobian', jacobian,'alpha',0.683);
                    else
                        error_vals=nlparci(obj.param, residual,'jacobian', jacobian);
                    end
                    obj.errors=zeros(length(error_vals),1);
                    for k=1:length(error_vals)
                      obj.errors(k)=(error_vals(k,2)-error_vals(k,1))/2; 
                    end
                    %**************************************************************
                    %calculation of the ft_factor for plotting the sites otherwise 
                    %their intensity would be much to low to see them in the normal 
                    %plot window 

                    ft_factor=(obj.param(1)-min(data.y))/max(obj.ta_model(obj.param,obj.x_dummy))*0.8;


                    setappdata(0,'ft_factor', ft_factor);
                    %**********************************************************
                    %****
                    [sites, table]=output(obj, obj.param, obj.errors);
                    y=obj.model_func(obj.param,data.x)';   
                else
                    sites=obj.sites;
                    table=zeros(obj.sites_num, 17);
                    residual=NaN;
                    y=NaN;
                end        
            end
        end
                
        %%**************************************************************
        %%output of parameters into the site array and a table matrix
        %****************************************************************
        function [sites, table]=output(obj, param, errors)
            site=obj.sites;
            con_matrix=getappdata(0,'con_matrix');
            
            bkg_param=getappdata(0,'bkg_param');
            bkg_param(1:obj.bkg_order)=param(1:obj.bkg_order);
            
            setappdata(0,'bkg_order', obj.bkg_order);
            setappdata(0,'bkg_param', bkg_param);
            setappdata(0,'I0', param(1));
            
            %create output table
            table=zeros(obj.sites_num, 17);
            l=1+obj.bkg_order; % counter for parameter number + die param die vorn dran für Bkg function sind
           
            for k=1:obj.sites_num
              if obj.sites(k).fit_method==0
                   %setting up standard values
                  if obj.sites(k).fit(1)
                      if obj.sites(k).con(1)<=0
                          % when the con value is below or equal 0 the param is
                          % not dependent on other params
                          site(k).cs=param(l);
                          site(k).cs_error=errors(l);
                          l=l+1;
                      elseif obj.sites(k).con(1)>0
                          % is dependet on another value con(1) saves the
                          % number of the constraint
                          m=obj.sites(k).con(1);
                          site(k).cs=con_matrix(m,5)*...
                              param(obj.con_val(m));
                          site(k).cs_error=con_matrix(m,5)*...
                              errors(obj.con_val(m)); 
                      end
                  else
                      site(k).cs_error=NaN;
                  end

                  if obj.sites(k).fit(2)
                      if obj.sites(k).con(2)<=0
                          % when the con value is below or equal 0 the param is
                          % not dependent on other params
                          site(k).fwhm=param(l);
                          site(k).fwhm_error=errors(l);
                          l=l+1;
                      elseif obj.sites(k).con(2)>0
                          % is dependet on another value con(1) saves the
                          % number of the constraint
                          m=obj.sites(k).con(2);
                          site(k).fwhm=con_matrix(m,5)*...
                              param(obj.con_val(m));
                          site(k).fwhm_error=con_matrix(m,5)*...
                              errors(obj.con_val(m)); 
                      end
                  else
                      site(k).fwhm_error=NaN;
                  end

                  if obj.sites(k).fit(3)
                      if obj.sites(k).con(3)<=0
                          % when the con value is below or equal 0 the param is
                          % not dependent on other params
                          site(k).intensity=param(l);
                          site(k).intensity_error=errors(l);
                          l=l+1;
                      elseif obj.sites(k).con(3)>0
                          % is dependet on another value con(1) saves the
                          % number of the constraint
                          m=obj.sites(k).con(3);
                          site(k).intensity=con_matrix(m,5)*...
                              param(obj.con_val(m));
                          site(k).intensity_error=con_matrix(m,5)*...
                              errors(obj.con_val(m)); 

                      end
                  else                  
                      site(k).intensity_error=NaN;
                  end


                  if strcmp(obj.sites(k).type, 'Singlet')
                      site(k).bhf=NaN;
                      site(k).bhf_error=NaN;
                      site(k).qs=NaN;
                      site(k).qs_error=NaN;                  
                  end

                  %setting up qs and bhf
                  if strcmp(obj.sites(k).type,'Doublet')
                      if obj.sites(k).fit(4)
                          if obj.sites(k).con(4)<=0
                              % when the con value is below or equal 0 the param is
                              % not dependent on other params
                              site(k).qs=param(l);
                              site(k).qs_error=errors(l);
                              l=l+1;
                          elseif obj.sites(k).con(4)>0
                              % is dependet on another value con(1) saves the
                              % number of the constraint
                              m=obj.sites(k).con(4);
                              site(k).qs=con_matrix(m,5)*...
                                  param(obj.con_val(m));
                              site(k).qs_error=con_matrix(m,5)*...
                                  errors(obj.con_val(m)); 
                          end
                      else
                          site(k).qs_error=NaN;                      
                      end
                      if obj.sites(k).fit(5)
                          if obj.sites(k).con(5)<=0
                              % when the con value is below or equal 0 the param is
                              % not dependent on other params
                              site(k).a12=param(l);
                              site(k).a12_error=errors(l);
                              l=l+1;
                          elseif obj.sites(k).con(5)>0
                              % is dependet on another value con(1) saves the
                              % number of the constraint
                              m=obj.sites(k).con(5);
                              site(k).a12=con_matrix(m,5)*...
                                  param(obj.con_val(m));
                              site(k).a12_error=con_matrix(m,5)*...
                                  errors(obj.con_val(m)); 
                          end
                      else
                          site(k).a12_error=NaN;
                      end
                      site(k).bhf=NaN;
                      site(k).bhf_error=NaN;
                  end

                  if strcmp(obj.sites(k).type, 'Sextet')
                      %QS
                      if obj.sites(k).fit(4)
                          if obj.sites(k).con(4)<=0
                              % when the con value is below or equal 0 the param is
                              % not dependent on other params
                              site(k).qs=param(l);
                              site(k).qs_error=errors(l);
                              l=l+1;
                          elseif obj.sites(k).con(4)>0
                              % is dependet on another value con(1) saves the
                              % number of the constraint
                              m=obj.sites(k).con(4);
                              site(k).qs=con_matrix(m,5)*...
                                  param(obj.con_val(m));
                              site(k).qs_error=con_matrix(m,5)*...
                                  errors(obj.con_val(m)); 
                          end
                      else
                          site(k).qs_error=NaN;
                      end
                      %a12
                      if obj.sites(k).fit(5)
                          if obj.sites(k).con(5)<=0
                              % when the con value is below or equal 0 the param is
                              % not dependent on other params
                              site(k).a12=param(l);
                              site(k).a12_error=errors(l);
                              l=l+1;
                          elseif obj.sites(k).con(5)>0
                              % is dependet on another value con(1) saves the
                              % number of the constraint
                              m=obj.sites(k).con(5);
                              site(k).a12=con_matrix(m,5)*...
                                  param(obj.con_val(m));
                              site(k).a12_error=con_matrix(m,5)*...
                                  errors(obj.con_val(m)); 
                          end
                      else
                          site(k).a12_error=NaN;
                      end

                      %BHF
                      if obj.sites(k).fit(6)
                          if obj.sites(k).con(6)<=0
                              % when the con value is below or equal 0 the param is
                              % not dependent on other params
                              site(k).bhf=param(l);
                              site(k).bhf_error=errors(l);
                              l=l+1;
                          elseif obj.sites(k).con(6)>0
                              % is dependet on another value con(1) saves the
                              % number of the constraint
                              m=obj.sites(k).con(6);
                              site(k).bhf=con_matrix(m,5)*...
                                  param(obj.con_val(m));
                              site(k).bhf_error=con_matrix(m,5)*...
                                  errors(obj.con_val(m)); 
                          end
                      else
                          site(k).bhf_error=NaN;
                      end

                      %a13
                      if obj.sites(k).fit(7)
                          if obj.sites(k).con(7)<=0
                              % when the con value is below or equal 0 the param is
                              % not dependent on other params
                              site(k).a13=param(l);
                              site(k).a13_error=errors(l);
                              l=l+1;
                          elseif obj.sites(k).con(7)>0
                              % is dependet on another value con(1) saves the
                              % number of the constraint
                              m=obj.sites(k).con(7);
                              site(k).a13=con_matrix(m,5)*...
                                  param(obj.con_val(m));
                              site(k).a13_error=con_matrix(m,5)*...
                                  errors(obj.con_val(m)); 
                          end
                      else
                          site(k).a13_error=NaN;
                      end
                  else
                      site(k).bhf=NaN;
                      site(k).bhf_error=NaN;
                  end

                  %setting up the pseudovoigt ratio

                  if strcmp(obj.sites(k).func_type,'PseudoVoigt')
                      site(k).n=param(l);
                      site(k).n_error=errors(l);
                      l=l+1;
                  else
                      site(k).n=NaN;
                      site(k).n_error=NaN;
                  end
               elseif obj.sites(k).fit_method==1
                   %do the qsd fitting stuff:
                  site(k).cs=param(l);
                  site(k).cs_error=errors(l);
                  l=l+1;
                  site(k).delta1=param(l);
                  site(k).delta1_error=errors(l);
                  l=l+1;
                  sum_pi=0;
                  sum_pi_error=0;
                  
                  for q=1:site(k).qsd_site_num
                      site(k).qsd_site(q).qs=param(l);
                      site(k).qsd_site(q).qs_error=errors(l);
                      l=l+1;
                      site(k).qsd_site(q).fwhm=param(l);
                      site(k).qsd_site(q).fwhm_error=errors(l);
                      l=l+1;
                      sum_pi=sum_pi+param(l);
                      sum_pi_error=sum_pi_error+errors(l);
                      site(k).qsd_site(q).p_i=param(l);
                      site(k).qsd_site(q).p_i_error=errors(l);
                      l=l+1;
                  end   
                  %now recalculate the intensity thing:
                  site(k)=site(k).recalculate_pi();
                  
                  site(k).intensity=sum_pi*2;%two peaks always!
                  site(k).intensity_error=sum_pi_error*2;
                  
                  site(k).fwhm=0.192;
                  site(k).fwhm_error=NaN;
                  
                  site(k).a12_error=NaN;
                  site(k).a13_error=NaN;
                  
                  site(k).bhf_error=NaN;
                  site(k).qs_error=NaN;
                  site(k).n=NaN;
                  site(k).n_error=NaN;   
               elseif obj.sites(k).fit_method==2
                  %do the xVBF fitting stuff:
                  site(k).delta1=param(l);
                  site(k).delta1_error=errors(l);
                  l=l+1;
                  site(k).intensity=param(l);
                  site(k).intensity_error=errors(l);
                  l=l+1;
                  site(k).cs=0;
                  site(k).cs_error=0;
                  site(k).qs=0;
                  site(k).qs_error=0;
                  for q=1:site(k).csd_site_num                    
                      
                      site(k).csd_site(q).cs=param(l);
                      site(k).csd_site(q).cs_error=errors(l);
                      l=l+1;
                      site(k).csd_site(q).fwhm=param(l);
                      site(k).csd_site(q).fwhm_error=errors(l);
                      l=l+1;
%                       site(k).csd_site(q).p_i=param(l);
%                       site(k).csd_site(q).p_i_error=errors(l);
%                       l=l+1;
                      site(k).csd_site(q).p_i=1;
                      site(k).csd_site(q).p_i_error=NaN;
                      
                      site(k).cs=site(k).csd_site(q).cs*site(k).csd_site(q).p_i+...
                          site(k).cs;
                      site(k).cs_error=site(k).cs_error+...
                          site(k).csd_site(q).cs_error*site(k).csd_site(q).p_i;
                  end   
                  
                  for q=1:site(k).qsd_site_num
                      site(k).qsd_site(q).qs=param(l);
                      site(k).qsd_site(q).qs_error=errors(l);
                      l=l+1;
                      site(k).qsd_site(q).fwhm=param(l);
                      site(k).qsd_site(q).fwhm_error=errors(l);
                      l=l+1;
%                       site(k).qsd_site(q).p_i=param(l);
%                       site(k).qsd_site(q).p_i_error=errors(l);
%                       l=l+1;
                      
                      site(k).qsd_site(q).p_i=1;
                      site(k).qsd_site(q).p_i_error=NaN;
                      
                      site(k).qs=site(k).qsd_site(q).qs*site(k).qsd_site(q).p_i+...
                          site(k).qs;
                      site(k).qs_error=site(k).qs_error+...
                          site(k).qsd_site(q).qs_error*site(k).qsd_site(q).p_i;
                  end      
                  %now recalculate the intensity thing:
                  
                  site(k).fwhm=0.097;
                  site(k).fwhm_error=NaN;
                  
                  site(k).a12_error=NaN;
                  site(k).a13_error=NaN;
                  
                  site(k).bhf_error=NaN;
                  site(k).n=NaN;
                  site(k).n_error=NaN;
                  
              end              
            end
            
              %recalculating intensity in % and the error values
              %calculating percentage values of intensities:
              
            %           first calculate whole intensity
            ges_int=0;
            for n=1:obj.sites_num
              ges_int=ges_int+(site(n).intensity);
            end

            int=zeros(obj.sites_num,1);
            int_err=zeros(obj.sites_num,1);
            
            for k=1:obj.sites_num                  
              %error absolut
              int_err(n)=0;
              for n=1:obj.sites_num
                  if k~=n                          
                      int_err(k)=int_err(k)+(site(k).intensity./(ges_int).^2.).^2*site(n).intensity_error.^2;
                  else
                      int_err(k)=int_err(k)+(1/ges_int-site(k).intensity/(ges_int)^2).^2*site(n).intensity_error.^2;
                  end
              end
              int_err(k)=sqrt(int_err(k))*100;
              int(k)=site(k).intensity/ges_int*100; 
               %setting now the table shit:
               %                   .
%                site(k).intensity, site(k).intensity_error,...
              table(k,:)=[site(k).cs, site(k).cs_error,...
                  site(k).fwhm, site(k).fwhm_error,...
                  int(k), int_err(k),...
                  site(k).qs, site(k).qs_error,...
                  site(k).bhf, site(k).bhf_error, 1,...
                  site(k).n, site(k).n_error,...
                  site(k).a12, site(k).a12_error,...
                  site(k).a13, site(k).a13_error];
            end
            obj.sites=site;
            obj.param=param;
            obj.errors=errors;
            sites=obj.sites;
        end %output function
        
    end %methods block    
end %class

