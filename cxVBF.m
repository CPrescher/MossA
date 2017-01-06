classdef cxVBF < handle
    
    properties
        panH
        %interface variables:
        convert_cb;
        site_num_txt; site_num_down_btn; site_num_up_btn; add_btn; del_btn; site_type;
        site_c_pan;
        
        site_pan;
        pi_txt; param_lbl, param_txt; fwhm_txt; delta1_txt;
        pi_cb; param_cb; fwhm_cb; delta1_cb;
        delta_pan;
        
        qsd_axes; csd_axes; pdd_axes;
        
        arr_left_btn; arr_right_btn;
        save_pan;
        save_graph_btn;    save_data_btn; 
        save_sites_btn;    pdd_plot_btn;   
    end
    
    methods
        function obj=cxVBF(panH)
            panel_width = getappdata(0, 'panel_width');
            if ismac 
                panel_width = panel_width-15;
            end
            obj.panH=panH;
            obj.convert_cb=uicontrol(panH, 'style','checkbox', 'String',...
                'convert','Value',0,'Position', [15 420 90 17], 'callback',...
                @obj.convert_cb_click,'enable','off');
            
            %*************************************************************
            %********************site_control_pan*************************
            %*************************************************************
            obj.site_c_pan=uipanel('Parent',panH,'units','pixel','Position',...
                [05 355 panel_width-15 60],'Userdata','panel');
            obj.site_num_txt=uicontrol(obj.site_c_pan, 'Style', 'edit','Horizontalalignment','right',...
                'backgroundcolor', [1 1 1], 'string','1', 'Position', [10 35 20 19],...
                'enable','inactive');
            
            site_num_down_btn=uicontrol(obj.site_c_pan, 'style', 'Pushbutton', 'String', '<',...
                'Position', [32 36 15 15], 'callback', @obj.site_num_down_btn_click, 'enable', 'off');
            site_num_up_btn=uicontrol(obj.site_c_pan, 'style', 'Pushbutton', 'String', '>',...
                'Position', [47 36 15 15], 'callback', @obj.site_num_up_btn_click,'enable', 'off');
            
            add_btn=uicontrol(obj.site_c_pan, 'style', 'Pushbutton', 'String', '+',...
                'Position', [70 30 panel_width*0.3 25], 'callback', @obj.add_btn_click, 'enable', 'off');
            del_btn=uicontrol(obj.site_c_pan,'style', 'pushbutton', 'string', '-',...
                'Position', [panel_width*0.7-20 30 panel_width*0.3 25], 'callback', @obj.del_btn_click, 'enable', 'off');
            obj.site_type =uicontrol(obj.site_c_pan, 'style', 'popupmenu',...
                'String', {'Central Shift', 'Quadrupol'},...
                'Position', [05 08 150 19], 'backgroundcolor', [1 1 1],...
                'callback', @obj.site_type_click);
            
            %*************************************************************
            %***********************site_param_pan************************
            %*************************************************************
            
            obj.site_pan=uipanel('Parent',panH,'units','pixel','Position',...
                [05 275 panel_width-15 75],'title', 'Params','Userdata','panel');
            
            uicontrol(obj.site_pan, 'Style', 'text', 'String', 'FWHM:',...
                'Position', [30 05 35 15],'horizontalalignment', 'right');
            obj.fwhm_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 05 panel_width-130 19], 'callback', @obj.value_cb,... 
                'enable', 'off','UserData', 'fwhm');
            obj.fwhm_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
                'Value', 1, 'Position',[panel_width-40 05 15 15],'callback',...
                @obj.cb_click, 'enable', 'off','UserData', 'fit(2)');

            obj.param_lbl=uicontrol(obj.site_pan, 'Style', 'text', 'String', 'QS:',...
                'Position', [30 25 35 15],'horizontalalignment', 'right');
            obj.param_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 25 panel_width-130 19], 'callback', @obj.value_cb,...
                'enable', 'off','UserData', 'cs');
            obj.param_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
                'Value', 1, 'Position',[panel_width-40 25 15 15],...
                'callback', @obj.cb_click, 'enable', 'off','UserData', 'fit(1)');
            
            uicontrol(obj.site_pan, 'Style', 'text', 'String', 'P_i:',...
                'Position', [30 45 35 15],'horizontalalignment', 'right');
            obj.pi_txt=uicontrol(obj.site_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 45 panel_width-130 19], 'callback', @obj.value_p_i_cb,...
                'enable', 'off');
%             obj.pi_cb=uicontrol(obj.site_pan,'style', 'checkbox', 'String','',...
%                 'Value', 1, 'Position',[160 65 15 15],...
%                 'callback', @cb_click, 'enable', 'off','UserData', 'fit(3)');

            obj.delta_pan=uipanel('Parent',panH,'units','pixel','Position',...
                [05 245 panel_width-15 30],'Userdata','panel');
            uicontrol(obj.delta_pan, 'Style', 'text', 'String', 'delta 1:',...
                'Position', [30 05 35 15],'horizontalalignment', 'right',...
                'enable', 'off');
            obj.delta1_txt=uicontrol(obj.delta_pan,'style','edit', 'string','',...
                'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
                'Position', [80 05 panel_width-130 19], 'callback', @obj.value_cb,...
                'UserData', 'delta1', 'enable', 'off');
            obj.delta1_cb=uicontrol(obj.delta_pan,'style', 'checkbox', 'String','',...
                 'Value', 1, 'Position',[panel_width-40 07 15 15],'enable', 'off',...
                 'callback', @obj.delta1_cb_click,'enable', 'off');
            
            %*************************************************************
            %***********************everything else***********************
            %*************************************************************
            obj.qsd_axes=axes('parent',panH, 'units','pixel',...
                'Position',[05 100 panel_width-20 140],'UserData','axes','YTick',zeros(1,0));
            obj.csd_axes=axes('parent',panH, 'units','pixel',...
                'Position',[05 100 panel_width-20 140],'UserData','axes','YTick',zeros(1,0),...
                'visible', 'off');
%             obj.pdd_axes=axes('parent',panH, 'units','pixel',...
%                 'Position',[45 100 140 140],'UserData','axes',...
%                 'visible', 'off');
            
            obj.save_pan=uipanel('Parent',panH,'units','pixel','Position',...
                [05 05 panel_width-15 70],'Userdata','panel');
            
            obj.save_graph_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'Save Graph', 'Position', [05 35 panel_width*0.4 25],...
                'callback', @obj.save_graph_btn_click, 'enable', 'off');
            obj.save_data_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'Save Data', 'Position', [panel_width*0.5 35 panel_width*0.4 25],...
                'callback', @obj.save_data_btn_click, 'enable', 'off');
            obj.save_sites_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'Save Sites', 'Position', [05 5 panel_width*0.4 25],...
                'callback', @obj.save_sites_btn_click, 'enable', 'off');
             obj.pdd_plot_btn=uicontrol(obj.save_pan, 'style', 'Pushbutton',...
                'String', 'PDD plot', 'Position', [panel_width*0.5 5 panel_width*0.4 25],...
                'callback', @obj.pdd_plot_btn_click, 'enable', 'off');
           
        end
        
        %******************************************************************
        %********************callbacks*************************************
        %******************************************************************
         function convert_cb_click(obj, hObject, ~)
            val=get(hObject,'value');
            if val
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                
                site(site_cur).fit_method=2;
                site(site_cur).fwhm_min=0;
                
                site(site_cur).csd_site_num=1;
                site(site_cur).qsd_site_num=1;
                
                site(site_cur).csd_site(1)=ccsd_site(1,site(site_cur).cs,0.2);
                site(site_cur).qsd_site(1)=cqsd_site(1,site(site_cur).qs,0.2);
                
                setappdata(0,'site_data',site);                
                obj.create_graph_handles();          
                obj.update();
                obj.xVBF_on();
            else
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                site(site_cur).fit_method=0;
                site(site_cur).fwhm_min=0.194;
                setappdata(0,'site_data',site);
                obj.update();
                obj.delete_graph_handles();   
                obj.xVBF_off();
                set(obj.site_num_txt,'string', '1');
            end
         end
        
         function create_graph_handles(obj)
             site=getappdata(0,'site_data');
             site_cur=getappdata(0,'site_cur');
             csd_site_num=site(site_cur).csd_site_num;
             qsd_site_num=site(site_cur).qsd_site_num; 
             
                          %create csd handles
             xmin=site(site_cur).csd_site(1).cs;
             xmax=site(site_cur).csd_site(1).cs+0.01;
             for k=1:csd_site_num
                xmin=min([xmin,site(site_cur).csd_site(k).cs-3*site(site_cur).csd_site(k).fwhm]);
                xmax=max([xmax,site(site_cur).csd_site(k).cs+3*site(site_cur).csd_site(k).fwhm]);
             end
             
             xrange=[xmin xmax];   
             x=linspace(xmin,xmax,500);  
             axes(obj.csd_axes);
             for k=1:csd_site_num
                 y=site(site_cur).csd_site(k).calc(x);
                 site(site_cur).csd_site(k).line_h=line(x,y);    
             end
             set(obj.csd_axes,'xlim', xrange); 
             
             %creat the qsd handles:
             xmin=site(site_cur).qsd_site(1).qs;
             xmax=site(site_cur).qsd_site(1).qs+0.01;
             for k=1:qsd_site_num
                xmin=min([xmin,site(site_cur).qsd_site(k).qs-3*site(site_cur).qsd_site(k).fwhm]);
                xmax=max([xmax,site(site_cur).qsd_site(k).qs+3*site(site_cur).qsd_site(k).fwhm]);
             end
             xrange=[xmin xmax];   
             x=linspace(xmin,xmax,500);    
             
             axes(obj.qsd_axes);
             hold on;
             for k=1:qsd_site_num
                 y=site(site_cur).qsd_site(k).calc(x);
                 site(site_cur).qsd_site(k).line_h=line(x,y);
             end
             hold off;
             set(obj.qsd_axes,'xlim', xrange); 
             setappdata(0,'site_data',site);
         end
         
         function delete_graph_handles(obj)
             delete(get(obj.qsd_axes,'children'));
             delete(get(obj.csd_axes,'children'));
         end
         
         function update(obj)
           site=getappdata(0,'site_data');
           site_cur=getappdata(0,'site_cur');
           if site(site_cur).fit_method==2
               obj.xVBF_on();
           else
               obj.xVBF_off();
           end
           
           obj.update_txt();
           obj.update_graph(); 
           obj.update_graph_height();
           obj.update_graph_colors();
        end
        
        function update_txt(obj)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');       
            dist_type=get(obj.site_type,'value');    
            if dist_type==1                
                csd_site_cur=site(site_cur).csd_site_cur;
                set(obj.site_num_txt,'string',csd_site_cur);
                
                set(obj.pi_txt,'string',site(site_cur).csd_site(csd_site_cur).p_i);
                
                set(obj.fwhm_txt,'string',site(site_cur).csd_site(csd_site_cur).fwhm);                
                set(obj.fwhm_cb,'value',site(site_cur).csd_site(csd_site_cur).fit(2));
                
                set(obj.param_txt,'string',site(site_cur).csd_site(csd_site_cur).cs);
                set(obj.param_lbl,'string','CS:');
                set(obj.param_txt,'userdata','cs');
                set(obj.param_cb,'value',site(site_cur).csd_site(csd_site_cur).fit(1));                
            elseif dist_type==2
                qsd_site_cur=site(site_cur).qsd_site_cur;
                set(obj.site_num_txt,'string',qsd_site_cur);
                
                set(obj.pi_txt,'string',site(site_cur).qsd_site(qsd_site_cur).p_i);
                
                set(obj.fwhm_txt,'string',site(site_cur).qsd_site(qsd_site_cur).fwhm);
                set(obj.fwhm_cb,'value',site(site_cur).qsd_site(qsd_site_cur).fit(2));
                
                set(obj.param_txt,'string',site(site_cur).qsd_site(qsd_site_cur).qs);
                set(obj.param_lbl,'string','QS:');
                set(obj.param_txt,'userdata','qs');                
                set(obj.param_cb,'value',site(site_cur).qsd_site(qsd_site_cur).fit(1));
            end
            set(obj.delta1_txt,'string',site(site_cur).delta1);
        end
        
        function update_graph(obj)       
            dist_type=get(obj.site_type,'value');             
            if dist_type==1
                obj.setAxisVisible(obj.csd_axes,'on');
                obj.setAxisVisible(obj.qsd_axes,'off'); 
            elseif dist_type==2
                obj.setAxisVisible(obj.csd_axes,'off');
                obj.setAxisVisible(obj.qsd_axes,'on');           
            end
        end
        
         function update_graph_handles(~)
             site=getappdata(0,'site_data');
             site_cur=getappdata(0,'site_cur');
             
             csd_site_num=site(site_cur).csd_site_num;
             qsd_site_num=site(site_cur).qsd_site_num;
             
             for k=1:csd_site_num
                 site(site_cur).csd_site(k).update_h();
             end
             for k=1:qsd_site_num
                 site(site_cur).qsd_site(k).update_h();                
             end             
         end
         
         function update_graph_colors(~)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            if site(site_cur).csd_site_num>1
                for k=1:site(site_cur).csd_site_num
                    if k==site(site_cur).csd_site_cur
                         set(site(site_cur).csd_site(k).line_h,'color','r');
                    else                        
                         set(site(site_cur).csd_site(k).line_h,'color','b');
                    end   
                end                
            end 
            if site(site_cur).qsd_site_num>1
                for k=1:site(site_cur).qsd_site_num
                    if k~=site(site_cur).qsd_site_cur
                        set(site(site_cur).qsd_site(k).line_h,'color','r');
                    else
                        set(site(site_cur).qsd_site(k).line_h,'color','b');
                    end   
                end                
            end             
            setappdata(0,'site_data',site);
         end
         function update_graph_height(obj)
             csd_handles=get(obj.csd_axes,'children');
             qsd_handles=get(obj.qsd_axes,'children');
             
             csd_ymax=0.01;
             qsd_ymax=0.01;
             for k=1:length(csd_handles)
                 csd_ymax=max([get(csd_handles(k),'ydata'), csd_ymax]);
             end
             for k=1:length(qsd_handles)
                 qsd_ymax=max([get(qsd_handles(k),'ydata'), qsd_ymax]);
             end
             
             set(obj.csd_axes,'ylim',[0 1.2*csd_ymax]);
             set(obj.qsd_axes,'ylim',[0 1.2*qsd_ymax]);
         end
        
        function xVBF_on(obj)
            h1=findobj('UserData', 'fit(4)');
            h2=findobj('UserData', 'qs');
            h3=findobj('UserData', 'fit(3)');
            h4=findobj('UserData', 'fit(2)');
            h5=findobj('UserData', 'fwhm');
            h6=findobj('UserData', 'fit(5)');
            h7=findobj('UserData', 'cs');
            h8=findobj('UserData', 'fit(1)');
            
            xVBF_h1=findobj('parent',obj.site_c_pan);
            xVBF_h2=findobj('parent',obj.site_pan);  
            xVBF_h3=findobj('parent',obj.save_pan);  
            xVBF_h4=findobj('parent',obj.delta_pan);
            
            %first disable the qs controls on the left side
            set(h1,'enable', 'off'); 
            set(h2,'enable', 'off');
            set(h3,'enable', 'off');
            set(h4,'enable', 'off');
            set(h5,'enable', 'off');
            set(h5,'String', '0.194');
            set(h6,'enable', 'off');
            set(h7,'enable', 'off');
            set(h8,'enable', 'off');
            
            %enable all the qsd interface controls
            set(xVBF_h1,'enable','on');
            set(xVBF_h2,'enable','on');
            set(xVBF_h3,'enable', 'on');
            
            set(xVBF_h4,'enable','on');
            
            set(obj.save_graph_btn,'enable','on');
            set(obj.convert_cb,'value',1);
        end
        
        function xVBF_off(obj)
            h1=findobj('UserData', 'fit(4)');
            h2=findobj('UserData', 'qs');
            h3=findobj('UserData', 'fit(3)');
            h4=findobj('UserData', 'fit(2)');
            h5=findobj('UserData', 'fwhm');
            h6=findobj('UserData', 'fit(5)');
            h7=findobj('UserData', 'cs');
            h8=findobj('UserData', 'fit(1)');
            
            xVBF_h1=findobj('parent',obj.site_c_pan);
            xVBF_h2=findobj('parent',obj.site_pan);
            xVBF_h3=findobj('parent',obj.save_pan); 
            xVBF_h4=findobj('parent',obj.delta_pan);
                     
            %enable the qs controls on the left side
            set(h1,'enable', 'on'); 
            set(h2,'enable', 'on'); 
            set(h3,'enable', 'on');
            set(h4,'enable', 'on');
            set(h5,'enable', 'on');
            set(h6,'enable', 'on');
            set(h7,'enable', 'on');
            set(h8,'enable', 'on');
            %disable all the qsd interface controls
            set(xVBF_h1,'enable','off');
            set(xVBF_h2,'enable','off');
            set(xVBF_h3,'enable','off');
            set(xVBF_h4,'enable','off');
            
            set(obj.save_graph_btn,'enable','off');  
            set(obj.convert_cb,'value',0);
        end
        
        
        function add_btn_click(obj,~,~)
            fitting = getappdata(0,'fitting_data');
            if strcmp(fitting.state,'normal')
                dist_type=get(obj.site_type,'value');
                
                if dist_type==1 %for CS
                   

                    site=getappdata(0,'site_data');
                    site_cur=getappdata(0,'site_cur');

                    site(site_cur).csd_site_num=site(site_cur).csd_site_num+1;
                    site(site_cur).csd_site_cur=site(site_cur).csd_site_num;
                    site(site_cur).csd_site(site(site_cur).csd_site_num)=ccsd_site(1,2,0.2);

                    %define initial values
                    set(obj.csd_axes,'NextPlot','add');
                    xlimits=get(obj.csd_axes,'xlim');
                    xdata=xlimits(1):0.01:xlimits(2);
                    clear ydata;
                    ydata(1:length(xdata))=NaN;


                    site(site_cur).csd_site(site(site_cur).csd_site_num).line_h=...
                        plot(obj.csd_axes,xdata,ydata,'r-');

                    %vertical line
                    
                    csd_ver_h=plot(obj.csd_axes, [0 0], [NaN NaN],'r--');
                    csd_hor_h=plot(obj.csd_axes, [min(xdata) max(xdata)], [NaN NaN],'r--');


                    setappdata(0,'csd_ver_h',csd_ver_h);
                    setappdata(0,'csd_hor_h',csd_hor_h);

                    setappdata(0,'site_data', site);
                    obj.update();

                    %define the slider things
                    set(obj.site_num_txt, 'String', site(site_cur).csd_site_num);
                    obj.update_graph_colors();
                    
                    fitting.state='define_csd1';
                    setappdata(0,'fitting_data',fitting);
                    
                elseif dist_type==2 %for qs
                    

                    site=getappdata(0,'site_data');
                    site_cur=getappdata(0,'site_cur');

                    site(site_cur).qsd_site_num=site(site_cur).qsd_site_num+1;
                    site(site_cur).qsd_site_cur=site(site_cur).qsd_site_num;
                    site(site_cur).qsd_site(site(site_cur).qsd_site_num)=cqsd_site(1,2,0.2);

                    %define initial values
                    set(obj.qsd_axes,'NextPlot','add');
                    xlimits=get(obj.qsd_axes,'xlim');
                    xdata=0:0.01:xlimits(2);
                    clear ydata;
                    ydata(1:length(xdata))=NaN;


                    site(site_cur).qsd_site(site(site_cur).qsd_site_num).line_h=...
                        plot(obj.qsd_axes,xdata,ydata,'r-');

                    %vertical line
                    qsd_ver_h=plot(obj.qsd_axes, [0 0], [NaN NaN],'r--');
                    qsd_hor_h=plot(obj.qsd_axes, [min(xdata) max(xdata)], [NaN NaN],'r--');


                    setappdata(0,'qsd_ver_h',qsd_ver_h);
                    setappdata(0,'qsd_hor_h',qsd_hor_h);

                    setappdata(0,'site_data', site);
                    obj.update();

                    %define the slider things
                    set(obj.site_num_txt, 'String', site(site_cur).qsd_site_num);
                    obj.update_graph_colors();
                    
                    fitting.state='define_qsd1';
                    setappdata(0,'fitting_data',fitting);
                end
            end      
        end
        
        function del_btn_click(obj,~,~)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            dist_type=get(obj.site_type,'value');
                
            if dist_type==1 %for CS
                csd_site_num=site(site_cur).csd_site_num;
                if csd_site_num>1
                    csd_site_cur=site(site_cur).csd_site_cur;
                    csd_site_old=site(site_cur).csd_site;

                    counter=0;

                    if csd_site_num>0
                        site(site_cur).csd_site(csd_site_cur).delete_h();
                    end

                    %saving the con matrix of the deleted site:
                    if csd_site_num>1
                        for k=1:csd_site_num
                            if k~=csd_site_cur
                                counter=counter+1;
                                csd_site_new(counter)=csd_site_old(k);
                            end
                        end
                        site(site_cur).csd_site=csd_site_new;
                        csd_site_num=csd_site_num-1;
                    else
                        csd_site_num=0;
                    end

                    %slider mist:
                    if csd_site_cur>1
                        csd_site_cur=csd_site_cur-1;
                    else
                        csd_site_cur=1;
                        %reset the textboxes
                        if csd_site_num>=1

                        else
                            set(obj.param_txt,'String','');
                            set(obj.fwhm_txt,'String','');
                            set(obj.pi_txt,'String','');
                            set(obj.delta1_txt,'String','');
                        end
                    end

                    set(obj.site_num_txt, 'String', csd_site_cur);
                    site(site_cur).csd_site_cur=csd_site_cur;
                    site(site_cur).csd_site_num=csd_site_num;
                    site(site_cur)=site(site_cur).recalculate_pi();
                end
            elseif dist_type==2 % for qs
                qsd_site_num=site(site_cur).qsd_site_num;
                if qsd_site_num>1
                    qsd_site_cur=site(site_cur).qsd_site_cur;
                    qsd_site_old=site(site_cur).qsd_site;

                    counter=0;

                    if qsd_site_num>0
                        site(site_cur).qsd_site(qsd_site_cur).delete_h();
                    end

                    %saving the con matrix of the deleted site:
                    if qsd_site_num>1
                        for k=1:qsd_site_num
                            if k~=qsd_site_cur
                                counter=counter+1;
                                qsd_site_new(counter)=qsd_site_old(k);
                            end
                        end
                        site(site_cur).qsd_site=qsd_site_new;
                        qsd_site_num=qsd_site_num-1;
                    else
                        qsd_site_num=0;
                    end

                    %slider mist:
                    if qsd_site_cur>1
                        qsd_site_cur=qsd_site_cur-1;
                    else
                        qsd_site_cur=1;
                        %reset the textboxes
                        if qsd_site_num>=1
                        else
                            set(obj.param_txt,'String','');
                            set(obj.fwhm_txt,'String','');
                            set(obj.pi_txt,'String','');
                            set(obj.delta1_txt,'String','');
                        end
                    end

                    set(obj.site_num_txt, 'String', qsd_site_cur);
                    site(site_cur).qsd_site_cur=qsd_site_cur;
                    site(site_cur).qsd_site_num=qsd_site_num;
                    site(site_cur)=site(site_cur).recalculate_pi();
                end
            end
            setappdata(0,'site_data', site);
            obj.delete_graph_handles();
            obj.create_graph_handles();
            obj.update();   
            obj.update_graph_colors();
        end
        
        function site_num_down_btn_click(obj,~,~)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            dist_type=get(obj.site_type,'value');
            if dist_type==1
                if site(site_cur).csd_site_cur>1
                    site(site_cur).csd_site_cur=site(site_cur).csd_site_cur-1;
                    setappdata(0,'site_data',site);
                    obj.update_txt();
                    obj.update_graph_colors();
                    set(obj.site_num_txt, 'String', site(site_cur).csd_site_cur);
                end
            elseif dist_type==2
                if site(site_cur).qsd_site_cur>1
                    site(site_cur).qsd_site_cur=site(site_cur).qsd_site_cur-1;
                    setappdata(0,'site_data',site);
                    obj.update_txt();
                    obj.update_graph_colors();
                    set(obj.site_num_txt, 'String', site(site_cur).qsd_site_cur);
                end
            end             
        end
        
        function site_num_up_btn_click(obj,~,~)
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            dist_type=get(obj.site_type,'value');
            if dist_type==1
                if site(site_cur).csd_site_cur<site(site_cur).csd_site_num
                    site(site_cur).csd_site_cur=site(site_cur).csd_site_cur+1;
                    set(obj.site_num_txt,'String', site(site_cur).csd_site_cur);
                    setappdata(0,'site_data',site);
                    obj.update_txt();
                    obj.update_graph_colors();
                    set(obj.site_num_txt, 'String', site(site_cur).csd_site_cur);
                end 
            elseif dist_type==2
                if site(site_cur).qsd_site_cur<site(site_cur).qsd_site_num
                    site(site_cur).qsd_site_cur=site(site_cur).qsd_site_cur+1;
                    set(obj.site_num_txt,'String', site(site_cur).qsd_site_cur);
                    setappdata(0,'site_data',site);
                    obj.update_txt();
                    obj.update_graph_colors();
                    set(obj.site_num_txt, 'String', site(site_cur).qsd_site_cur);
                end 
            end
            
        end
        
        function value_cb(obj, hObject, ~)
            str=get(hObject,'string');
            str=strrep(str,',','.');
            var=str2double(str);
            if isnan(var)
                beep;
                set(hObject,'String', '');
            else
                set(hObject,'String',var);
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                csd_site_cur=site(site_cur).csd_site_cur;
                qsd_site_cur=site(site_cur).qsd_site_cur;
                dist_type=get(obj.site_type,'value');
                if dist_type==1 %for CS
                    if ~strcmp(get(hObject, 'UserData'),'delta1')
                        str=['site(site_cur).csd_site(csd_site_cur).',...
                            get(hObject, 'UserData'),'=str2double(get(hObject,''String''));'];
                        eval(str);
                    else
                        site(site_cur).delta1=str2double(get(hObject,'String'));
                    end
                elseif dist_type==2 %for qs
                    if ~strcmp(get(hObject, 'UserData'),'delta1')
                        str=['site(site_cur).qsd_site(qsd_site_cur).',...
                            get(hObject, 'UserData'),'=str2double(get(hObject,''String''));'];
                        eval(str);
                    else
                        site(site_cur).delta1=str2double(get(hObject,'String'));
                    end
                end                    
                site(site_cur)=site(site_cur).recalculate_pi();
                setappdata(0,'site_data',site);
                
                
                obj.delete_graph_handles();
                obj.create_graph_handles();
                site(site_cur).update_h();
                obj.update();
            end                
        end    
        
        function value_p_i_cb(obj, hObject, ~)
            str=get(hObject,'string');
            str=strrep(str,',','.');
            var=str2double(str);
            if isnan(var)
                beep;
                set(hObject,'String', '');
            else
                if var~=1
                    var=mod(abs(var),floor(abs(var)));
                end
                set(hObject,'String',var);
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                csd_site_cur=site(site_cur).csd_site_cur;
                qsd_site_cur=site(site_cur).qsd_site_cur;
                dist_type=get(obj.site_type,'value');
                if dist_type==1 %for CS
                    for k=1:site(site_cur).csd_site_num
                       if k~=csd_site_cur
                          if site(site_cur).csd_site(k).p_i~=0
                            site(site_cur).csd_site(k).p_i=...
                              site(site_cur).csd_site(k).p_i./(1-site(site_cur).csd_site(csd_site_cur).p_i).*...
                              (1-var);
                          elseif site(site_cur).csd_site(k).p_i==0
                               site(site_cur).csd_site(k).p_i=(1-var)/...
                                 (site(site_cur).csd_site_num-1);
                          end                           
                       end                       
                    end 
                    site(site_cur).csd_site(csd_site_cur).p_i=var;
                elseif dist_type==2 %for qs
                    for k=1:site(site_cur).qsd_site_num
                       if site(site_cur).qsd_site(k).p_i~=0
                            site(site_cur).qsd_site(k).p_i=...
                              site(site_cur).qsd_site(k).p_i./(1-site(site_cur).qsd_site(qsd_site_cur).p_i).*...
                              (1-var);
                          elseif site(site_cur).qsd_site(k).p_i==0
                               site(site_cur).qsd_site(k).p_i=(1-var)/...
                                 (site(site_cur).qsd_site_num-1);
                          end                              
                    end 
                    site(site_cur).qsd_site(qsd_site_cur).p_i=var;
                end
                setappdata(0,'site_data',site);
                obj.delete_graph_handles();
                obj.create_graph_handles();
                site(site_cur).update_h();
                obj.update();
            end   
        end
        
        
        function setAxisVisible(~,axesH, param)      
           set(axesH,'visible', param);
           set(get(axesH,'children'),'visible',param);
           set(findobj('parent',axesH),'visible',param);
        end
        
        function site_type_click(obj,hObject,~)
           obj.update();
        end
        
        function cb_click(obj,hObject, ~)
            old_value=get(hObject, 'Value');
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            
            dist_type=get(obj.site_type,'value');
            if dist_type==1
                csd_site_cur=site(site_cur).csd_site_cur;
                str=['site(site_cur).csd_site(csd_site_cur).',get(hObject, 'UserData'),'=old_value;'];
            elseif dist_type==2
                qsd_site_cur=site(site_cur).qsd_site_cur;
                str=['site(site_cur).qsd_site(qsd_site_cur).',get(hObject, 'UserData'),'=old_value;'];
            end
            eval(str);
            setappdata(0,'site_data', site);
            obj.update();
        end
        function delta1_cb_click(obj,hObject,~)
            old_value=get(hObject, 'Value');
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            site(site_cur).delta1_fit=old_value;          
            setappdata(0,'site_data',site);
        end
        
        
        function save_graph_btn_click(obj,~,~)
            set(gcf,'Renderer','OpenGL')
            out_fig=figure;
            test=axes('parent',out_fig);
            dist_type=get(obj.site_type,'value');
            if dist_type==1
                copy_graphs(obj.csd_axes,test);
            elseif dist_type==2;
                copy_graphs(obj.qsd_axes,test);
            end
            set(test,'YTick',zeros(1,0));
        end
        
        function save_data_btn_click(obj,~,~)
            work_path=getappdata(0,'work_path');
            if length(work_path)==0
                work_path=pwd;
            end
            old_folder=cd(work_path);
            [file,path] = uiputfile({'*.txt'},...
                'Save data of the graph window');
            if path
                dist_type=get(obj.site_type,'value');
                if dist_type==1
                    lh=findall(obj.csd_axes,'type','line');
                elseif dist_type==2
                    lh=findall(obj.qsd_axes,'type','line');
                end
                data.x=get(lh,'xdata');
                data.y=get(lh,'ydata');
                if ~iscell(data.x)
                   mat(:,1)=data.x;
                   mat(:,2)=data.y;
                else
                  l=zeros(length(data.x),1);
                  for n=1:length(data.x)
                    l(n)=length(data.x{n});
                  end
                  mat=ones(max(l),2);
                  for n=1:length(data.x)
                    mat(1:l(n),2*n-1)=data.x{n};
                    mat(1:l(n),2*n)=data.y{n};
                  end
                end
                dlmwrite([path, file], mat,'delimiter', '\t');
                fclose('all');
            end  
            cd(old_folder);
        end
        
        function save_sites_btn_click(obj,~,~)
            work_path=getappdata(0,'work_path');
        
            if length(work_path)==0
                work_path=pwd;
            end
            old_folder=cd(work_path);
            [file,path] = uiputfile({'*.txt'},...
                'Save fitted xVBF parameter');
            if path
                setappdata(0,'work_path', path);  
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');
                
                output(1,:)= {'site', 'pi','error','CS', 'error',...
                    'FWHM','error', 'delta1', 'error'};                    
                csd_site_num=site(site_cur).qsd_site_num;

                for k=1:csd_site_num
                   output(k+1,:)={k, ...
                       site(site_cur).csd_site(k).p_i, site(site_cur).csd_site(k).p_i_error,...
                       site(site_cur).csd_site(k).cs, site(site_cur).csd_site(k).cs_error,...
                       site(site_cur).csd_site(k).fwhm, site(site_cur).csd_site(k).fwhm_error,...
                       site(site_cur).delta1, site(site_cur).delta1_error};
                end   
                output(csd_site_num+2,:)= {'site', 'pi','error','QS', 'error',...
                    'FWHM','error', 'delta1', 'error'};                    
                qsd_site_num=site(site_cur).qsd_site_num;

                for k=1:qsd_site_num
                   output(csd_site_num+k+2,:)={k, ...
                       site(site_cur).qsd_site(k).p_i, site(site_cur).qsd_site(k).p_i_error,...
                       site(site_cur).qsd_site(k).qs, site(site_cur).qsd_site(k).qs_error,...
                       site(site_cur).qsd_site(k).fwhm, site(site_cur).qsd_site(k).fwhm_error,...
                       site(site_cur).delta1, site(site_cur).delta1_error};
                end     
                dlmcell([path,file],output,';'); 
            end 
            cd(old_folder);
        end
        function pdd_plot_btn_click(~,~,~)            
            site=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            [x,y,z]=site(site_cur).pdd_calc();
            figure;
            contour(x,y,z)
            box('on');
            xlabel('CS (mm/s)'); ylabel('QS (mm/s)');
            figure;
            surf(x,y,z,'linestyle','none');
            box('on');
            xlim([min(min(x)) max(max(x))]);
            ylim([min(min(y)) max(max(y))]);
            xlabel('CS (mm/s)'); ylabel('QS (mm/s)');
        end
    end
    
end

