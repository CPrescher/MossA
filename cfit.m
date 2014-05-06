classdef cfit
    %cfit capsulates all the fitting of MossA, for a better readability
    %etc. and maintenance
    %   Detailed explanation goes here
    
    properties
        %general poperties
        param_num; bkg_order; 
        sites; %array of all the sites to fit
        sites_num; %number of sites
        status; %fitting status or error bar
        output_txt; %handle for the text output
        output_graph; %handle for the graph output
        param; residual;
        %types used:
        %bkg,cs,fwhm,qs,bhf,intensity,ratio,p_i,delta1
        
        %fitting properties
        func_str;
        bkg_str;
        bkg_model;
        model;
        ub=[]; lb=[]; ival=[]; %upper and lower boundaries, inital valus
        errors; % array with error values for every fitting parameter
        
        %constraint array
        con_val=[]; %will save the l values of the var1 in var2=fac*var1;
        
        %linear equalities matrices
        Aeq, beq;
        
        %strings for every site and function for every site:)
        %used for plotting during fitting...
        site_str;
        site_func;
    end
    
    methods
        %constructor
        function obj=cfit(output_txt,output_graph, sites, polynom_type)
           obj.sites=sites;
           obj.output_txt=output_txt;
           obj.output_graph=output_graph;
           obj.sites_num=length(sites);
           obj.bkg_order=polynom_type;
        end
        
        
        %%************************************************************
        %%build iniial values and upper and lower boundaries +model
        %%function
        %************************************************************
        
        function obj=start(obj)
            obj.bkg_str='';
            obj.ub=[];
            obj.lb=[];
            obj.ival=[];
            
            bkg_param=getappdata(0, 'bkg_param');
            
            %**************************************************************
            %*****************background order ***************************
            %************************************************************            
            
            l=1;
            for n=1:obj.bkg_order
               obj.bkg_str=[obj.bkg_str, '-x(',int2str(l),')*xdata.^',int2str(n-1)];
               obj.ub=[obj.ub; inf];
               obj.lb=[obj.lb; -inf];
               if n==1
                   obj.ival=[obj.ival; -getappdata(0,'I0')];
               else
                  obj.ival=[obj.ival;  bkg_param(n)];
               end
               l=l+1;
            end  
            
            obj.func_str=obj.bkg_str;
            
            obj.bkg_str=['@(x,xdata)(',obj.bkg_str,')'];
            obj.bkg_model=eval(obj.bkg_str);
                        
             
            %linear constraints initialisation
            cs_lcon_counter=1;
            qs_lcon_counter=1;
            cs_pi_lcon{cs_lcon_counter}=[];
            qs_pi_lcon{qs_lcon_counter}=[];
            obj.Aeq=[];
            obj.beq=[];
            
            xVBF_sites_num=0;
            
            %**************************************************************
            %*******************normal fitting*****************************
            %**************************************************************
            con_matrix=getappdata(0,'con_matrix');
            con_num=getappdata(0,'con_num');
            
            obj.site_str=cell(obj.sites_num);
           
            
            for k=1:obj.sites_num
                matrix=obj.sites(k).getMatrix();
                
                if obj.sites(k).fit_method==0
                    
                    if strcmp(obj.sites(k).func_type,'Lorentzian')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='-lorentz_curve(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='-doublet(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                            obj.site_str{k}='-sextet(';
                        end;
                    elseif strcmp(obj.sites(k).func_type,'Gaussian')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='-gauss_curve(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='-doublet_g(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                            obj.site_str{k}='-sextet_g(';
                        end;
                    elseif strcmp(obj.sites(k).func_type,'PseudoVoigt')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='-pseudov_curve(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='-doublet_p(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                           obj.site_str{k}='-sextet_p(';
                        end;
                    elseif strcmp(obj.sites(k).func_type,'LorSquared')
                        if strcmp(obj.sites(k).type, 'Singlet')
                            obj.site_str{k}='-lorentz_squared(';
                        elseif strcmp(obj.sites(k).type, 'Doublet')
                            obj.site_str{k}='-doublet_ls(';
                        elseif strcmp(obj.sites(k).type, 'Sextet')
                            obj.site_str{k}= '-sextet_ls(';
                        end
                    end


                    %setting up cs, hwhm, int and qs/bhf
                    con=obj.sites(k).con;
                    dim=size(matrix,1);
                
                    for n=1:dim
                       if matrix(n,1) %means that the variable is fitted
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
                    obj.site_str{k}=[obj.site_str{k},'xdata)']; 
                    
                %xVBF fit...
                elseif obj.sites(k).fit_method==2
                
                    xVBF_sites_num=xVBF_sites_num+1;
                    
                    start_index=l;
                    l=l+2;
                                        
                    %short explanations of the meanings of variables:
                    %start_index   - delta1 corrleation parameter
                    %start_index+1 - Intensity
                   
                    %initiate ival and boundaries for delta1:
                    obj.ival=[obj.ival; obj.sites(k).delta1];
                    if obj.sites(k).delta1_fit
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
                        
                        if obj.sites(k).csd_site_num>1
                            %cs_pi
                            cs_pi_index(n_cs)=l+2;
                            
                            obj.ival=[obj.ival; obj.sites(k).csd_site(n_cs).p_i];
                            obj.lb=[obj.lb; 0];
                            obj.ub=[obj.ub; 1];
                            
                            l=l+3;
                        else
                            l=l+2;
                        end
                    end
                    
                    qs_index=zeros(1,obj.sites(k).qsd_site_num);
                    qs_fwhm_index=zeros(1,obj.sites(k).qsd_site_num);
                    qs_pi_index=zeros(1,obj.sites(k).qsd_site_num);
                    
                    for n_qs=1:obj.sites(k).qsd_site_num
                        qs_index(n_qs)=l;
                        qs_fwhm_index(n_qs)=l+1;

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
                        
                        if obj.sites(k).qsd_site_num>1
                            qs_pi_index(n_qs)=l+2;
                            %qs_pi
                            obj.ival=[obj.ival; obj.sites(k).qsd_site(n_qs).p_i];
                            obj.lb=[obj.lb; 0];
                            obj.ub=[obj.ub; 1];
                            
                            l=l+3;
                        else
                            l=l+2;
                        end
                    end
                    
                     %initiation of the Aeq=b linear conditions:
                     
                     if obj.sites(k).csd_site_num > 1
                         cs_pi_lcon{cs_lcon_counter}=cs_pi_index;
                         cs_lcon_counter=cs_lcon_counter+1;
                     end
                     if obj.sites(k).qsd_site_num > 1
                         qs_pi_lcon{qs_lcon_counter}=qs_pi_index;
                         qs_lcon_counter=qs_lcon_counter+1;
                     end
                    
                    obj.site_str{k}='';
                    for n_cs=1:obj.sites(k).csd_site_num    
                        for n_qs=1:obj.sites(k).qsd_site_num;    
                            %first void:
                            %defining the center with QS dependence
                            obj.site_str{k}=[obj.site_str{k},'-voigt_curve('];
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
                            if obj.sites(k).csd_site_num==1 && obj.sites(k).qsd_site_num==1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                int2str(start_index+1),')*0.5,'];
                            elseif obj.sites(k).csd_site_num==1 && obj.sites(k).qsd_site_num>1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                    int2str(qs_pi_index(n_qs)),')*x(',...
                                    int2str(start_index+1),')*0.5,'];                                
                            elseif obj.sites(k).csd_site_num>1 && obj.sites(k).qsd_site_num==1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                    int2str(cs_pi_index(n_cs)),')*x(',...
                                    int2str(start_index+1),')*0.5,'];
                            elseif obj.sites(k).csd_site_num>1 && obj.sites(k).qsd_site_num>1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                    int2str(cs_pi_index(n_cs)),')*x(',...
                                    int2str(qs_pi_index(n_qs)),')*x(',...
                                    int2str(start_index+1),')*0.5,'];
                            end
                            
                            obj.site_str{k}=[obj.site_str{k},'xdata)']; 
                            
                            %**************************************************
                            %*****************second void curve ***************
                            %**************************************************
                            obj.site_str{k}=[obj.site_str{k},'-voigt_curve('];
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
                            if obj.sites(k).csd_site_num==1 && obj.sites(k).qsd_site_num==1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                int2str(start_index+1),')*0.5,'];
                            elseif obj.sites(k).csd_site_num==1 && obj.sites(k).qsd_site_num>1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                    int2str(qs_pi_index(n_qs)),')*x(',...
                                    int2str(start_index+1),')*0.5,'];                                
                            elseif obj.sites(k).csd_site_num>1 && obj.sites(k).qsd_site_num==1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                    int2str(cs_pi_index(n_cs)),')*x(',...
                                    int2str(start_index+1),')*0.5,'];
                            elseif obj.sites(k).csd_site_num>1 && obj.sites(k).qsd_site_num>1
                                obj.site_str{k}=[obj.site_str{k},'x(',...
                                    int2str(cs_pi_index(n_cs)),')*x(',...
                                    int2str(qs_pi_index(n_qs)),')*x(',...
                                    int2str(start_index+1),')*0.5,'];
                            end

                            obj.site_str{k}=[obj.site_str{k},'xdata)']; 
                        end  
                    end
                end
                 
                
                %save the str in the thin-absorber approximation string
                obj.func_str=[obj.func_str,obj.site_str{k}];
                
                %create model functions:
                str=['@(x,xdata)(',obj.site_str{k},')'];  
                obj.site_func{k}=eval(str);
                
            end
            
            %create inequality things:
            if cs_lcon_counter~=1 || qs_lcon_counter~=1
                %first check how many are empty:
                con_number=cs_lcon_counter+qs_lcon_counter-2;
                var_number=l-1;
                obj.Aeq=zeros(con_number,var_number);
                obj.beq=ones(con_number,1);
                
                for n=1:cs_lcon_counter-1
                    obj.Aeq(n,cs_pi_lcon{n})=1;            
                end
                for n=cs_lcon_counter:qs_lcon_counter-1
                    obj.Aeq(n,qs_pi_lcon{n})=1;           
                end
            end
            test=obj.Aeq
            sprintf(obj.func_str)
            obj.func_str=['@(x,xdata)(',obj.func_str,')'];
            obj.func_str
            obj.model=eval(obj.func_str);    
        end %build
        
        function rrms=model_func(obj,x)
            data=getappdata(0,'data');
            res=(data.y-obj.model(x,data.x)).^2;
            rrms=sum(res);
        end
        
        function stop = outfun(obj, x, optimValues,state)
            stop = false;
            switch state
            case 'init'
               hold on
            case 'iter'
                data=getappdata(0,'data');    
                
                str=cellstr(get(obj.output_txt, 'String')); 
                
                chi_square=sum((data.y-obj.model(x,data.x)).^2./data.y)./length(data.x);
                             
                 str=[str; cellstr(sprintf('       %d \t %2.6f',...
                     optimValues.iteration,chi_square))];
                    
                %now lift the text upwards if there are too many lines
                if length(str)>8
                    new_str=str(2:9);
                    str=new_str;
                end
                set(obj.output_txt, 'String',str);
                
                %plot the steps in between:
                        
                %bkg
                bkg=obj.bkg_model(x,data.x);
                set(getappdata(0,'bkg_h'),'ydata',bkg);
                
                %sites
                site=getappdata(0,'site_data');
                for k=1:obj.sites_num
                    y=-x(1)+obj.site_func{k}(x,data.x);
                    set(site(k).line_h,'ydata',y);
                end
                             
                %model
                set(getappdata(0,'sum_h'),'ydata',obj.model(x,data.x));
                
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
       
         
        
        function [sites, table, residual, y]=process(obj)                      
            obj=obj.start();
            
            data=getappdata(0,'data');
            solver=getappdata(0,'solver');
            if strcmp(solver,'lsqcurvefit')
                
                options=optimset('OutputFcn', @obj.outfun,'MaxFunEvals', 7000);
                [obj.param,~,residual,~,~,~,jacobian] = ...
                   lsqcurvefit(obj.model, obj.ival, data.x, data.y, ...
                   obj.lb, obj.ub, options);
               str=obj.model


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

                    [sites, table]=output(obj, obj.param, obj.errors);
                    y=obj.model(obj.param,data.x)';       
                else
                    sites=obj.sites;
                    table=zeros(obj.sites_num, 17);
                    residual=NaN;
                    y=NaN;
                end
            elseif strcmp(solver,'fmincon')
                options=optimset('OutputFcn', @obj.outfun,'MaxFunEvals', 7000,...
                    'algorithm','interior-point','DiffMaxChange', 0.05);
                
                [obj.param,~,~,~,~,~,~] = ...
                   fmincon(@obj.model_func, obj.ival, [],[],obj.Aeq,obj.beq, ...
                   obj.lb, obj.ub,[],options);
               
%                 [obj.param,~,~,~,~,~,~] = ...
%                    fmincon(@obj.model_func, obj.ival, [],[],[],[], ...
%                    obj.lb, obj.ub,[],options);


                residual=data.y-obj.model(obj.param,data.x);

                if ~getappdata(0,'stop_fitting');
                    jacobian=calcJacobian(obj.model,obj.param,data.x);
                    dlmwrite('jacob.txt',jacobian);
                    if strcmp(getappdata(0,'error'),'1sigma')
                        error_vals=nlparci(obj.param, residual,'jacobian', jacobian,'alpha',0.683);
                    else
                        error_vals=nlparci(obj.param, residual,'jacobian', jacobian);
                    end
                    
                    obj.errors=zeros(length(error_vals),1);
                    for k=1:length(error_vals)
                      obj.errors(k)=(error_vals(k,2)-error_vals(k,1))/2; 
                    end

                    [sites, table]=output(obj, obj.param, obj.errors);
                    y=obj.model(obj.param,data.x)';       
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
            setappdata(0,'I0', -param(1));
            
            %create output table
            table=zeros(obj.sites_num, 17);
            l=1+obj.bkg_order; % counter for parameter number + die param die vorn dran für Bkg function sind
            for k=1:obj.sites_num
               
              %setting up standard values
              if obj.sites(k).fit_method==0;
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
                  else
                      site(k).qs_error=NaN;
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
                          site(k).a12_error=NaN;
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
                  
              elseif obj.sites(k).fit_method==2
                  %do the xVBF fitting stuff:
                  site(k).delta1=param(l);
                  site(k).delta1_error=errors(l);
                  l=l+1;
                  site(k).intensity=param(l);
                  site(k).intensity_error=errors(l);
                  l=l+1;
                  site(k).cs=0;
                  site(k).qs=0;
                  site(k).cs_error=0;
                  site(k).qs_error=0;
                  for q=1:site(k).csd_site_num                    
                      
                      site(k).csd_site(q).cs=param(l);
                      site(k).csd_site(q).cs_error=errors(l);
                      l=l+1;
                      site(k).csd_site(q).fwhm=param(l);
                      site(k).csd_site(q).fwhm_error=errors(l);
                      l=l+1;
                      
                      if site(k).csd_site_num>1
                          site(k).csd_site(q).p_i=param(l);
                          site(k).csd_site(q).p_i_error=errors(l);
                          l=l+1;
                      else
                        site(k).csd_site(q).p_i=1;
                        site(k).csd_site(q).p_i_error=NaN;
                      end                       
                      
                      site(k).cs=site(k).csd_site(q).cs*site(k).csd_site(q).p_i+...
                          site(k).cs;
                      site(k).cs_error=site(k).cs_error+...
                          site(k).csd_site(q).cs_error.*site(k).csd_site(q).p_i;
                  end   
                  
                  
                  for q=1:site(k).qsd_site_num
                      site(k).qsd_site(q).qs=param(l);
                      site(k).qsd_site(q).qs_error=errors(l);
                      l=l+1;
                      site(k).qsd_site(q).fwhm=param(l);
                     
                      site(k).qsd_site(q).fwhm_error=errors(l);
                      l=l+1;
                      
                      if site(k).qsd_site_num>1
                          site(k).qsd_site(q).p_i=param(l);
                          site(k).qsd_site(q).p_i_error=errors(l);
                          l=l+1;
                      else
                        site(k).qsd_site(q).p_i=1;
                        site(k).qsd_site(q).p_i_error=NaN;
                      end    
                      
                      site(k).qs=site(k).qsd_site(q).qs*site(k).qsd_site(q).p_i+...
                          site(k).qs;
                      site(k).qs_error=site(k).qs_error+...
                          site(k).qsd_site(q).qs_error.*site(k).qsd_site(q).p_i;
                  end                        
                  
                  
                  site(k).fwhm=0.194;
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

