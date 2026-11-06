classdef cMaProject
    
    properties
        data, residual,  I0,  resH
        sites, currentSite,numberSite, siteH, sumH,
        backgroundParam, backgroundOrder, backgroundH
        chi2, tableContent, 
        
        ftFit, ftFactor, ftScale, ftY, ftLor2,
        fwhmSource, srcCalibFwhm,     
        
        conNum, conCur, conMatrix
        
        sinusoidal, 
        
        %calibParam
        maxVel, stdCs
    end
    
    methods
        
        function obj=cMaProject()
            obj.data=getappdata(0,'data');
            obj.residual=getappdata(0,'residual');            
            obj.resH=getappdata(0,'res_h');
            obj.I0=getappdata(0,'I0');
            
            obj.sites=getappdata(0,'site_data');
            obj.currentSite=getappdata(0,'site_cur');
            obj.numberSite=getappdata(0,'site_num');
            obj.siteH=getappdata(0,'site_h');
            obj.sumH=getappdata(0,'sum_h');
            
            obj.backgroundParam=getappdata(0,'bkg_param');
            obj.backgroundOrder=getappdata(0,'bkg_order');
            obj.backgroundH=getappdata(0,'bkg_h');
            
            obj.ftFit=getappdata(0,'ft_fit');
            obj.ftFactor=getappdata(0,'ft_factor');
            obj.ftScale=getappdata(0,'ft_scale');
            obj.ftY=getappdata(0,'ft_y');
            obj.ftLor2=getappdata(0,'ft_lor2');
            obj.fwhmSource=getappdata(0,'fwhm_s');
            obj.srcCalibFwhm=getappdata(0,'src_calib_fwhm');
            
            obj.conNum=getappdata(0,'con_num');
            obj.conCur=getappdata(0,'con_cur');
            obj.conMatrix=getappdata(0,'con_matrix');
            
            obj.sinusoidal=getappdata(0,'sinusoidal');
            obj.maxVel=getappdata(0,'maxv');
            obj.stdCs=getappdata(0,'stdcs');                      
        end
        
        function saveProject(obj)
            work_path=getappdata(0,'work_path');
            file_name=getappdata(0,'file');
            if isempty(work_path)
                work_path=pwd;
            end
            old_folder=cd(work_path);
            [file,path] = uiputfile({'*.map'},...
                'Save fitted Site parameter',[file_name,'.map']);
            if path

                setappdata(0,'work_path', path);
                save([path,file],'obj');  
            end   
            cd(old_folder);        
        end
        
        function loadProject(~)
            work_path=getappdata(0,'work_path');
            if isempty(work_path)
                work_path=pwd;
            end
            old_folder=cd(work_path);

            [file,path] = uigetfile({'*.map'},'Load Sites File');

            if path     
                setappdata(0,'work_path',path);
               
                %load all data into global variables
                
                project=load([path,file], '-mat');
                
                setappdata(0,'data',project.obj.data);                
                setappdata(0,'residual',project.obj.residual);   
                setappdata(0,'I0',project.obj.I0);

                setappdata(0,'site_data',project.obj.sites);
                setappdata(0,'site_cur',project.obj.currentSite);
                setappdata(0,'site_num',project.obj.numberSite);

                setappdata(0,'bkg_param',project.obj.backgroundParam);
                setappdata(0,'bkg_order',project.obj.backgroundOrder);

                setappdata(0,'ft_fit',project.obj.ftFit);
                setappdata(0,'ft_factor',project.obj.ftFactor);
                setappdata(0,'ft_scale',project.obj.ftScale);
                setappdata(0,'ft_y',project.obj.ftY);
                setappdata(0,'ft_lor2',project.obj.ftLor2);
                setappdata(0,'fwhm_s',project.obj.fwhmSource);
                setappdata(0,'src_calib_fwhm',project.obj.srcCalibFwhm);

                setappdata(0,'con_num',project.obj.conNum);
                setappdata(0,'con_cur',project.obj.conCur);
                setappdata(0,'con_matrix',project.obj.conMatrix);

                setappdata(0,'sinusoidal',project.obj.sinusoidal);
                setappdata(0,'maxv',project.obj.maxVel);
                setappdata(0,'stdcs',project.obj.stdCs);      
                
                
                createHandles=getappdata(0,'createHandles');
                createHandles();
                
                %update the interface                
                updateTxt=getappdata(0,'update_txt');
                updateTxt();
                
            end
            cd(old_folder);  
        end
    end    
end

