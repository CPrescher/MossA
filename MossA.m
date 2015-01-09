function MossA(varargin)
version='1.01b';

%  Initialization tasks
width=1024;
height=600;
setappdata(0,'old_height',600); %is needed for the resize function
                                %always storing the height befor the resize
                                %event occurs


fh=figure('Visible','off','Name', ['MossA ',version],...
    'resize','on','position',[200 200 width height],'MenuBar', 'none',...
    'ToolBar','none','WindowButtonMotionFcn',@fh_WindowButtonMotionFcn,... 
     'NumberTitle', 'off','WindowButtonDownFcn', @fh_WindowButtonDownFcn,...
     'ResizeFcn', @fh_ResizeFcn, 'KeyPressFcn',@fh_KeyPressFcn);


%  Construct the components
handles=guidata(fh);

%defining panels
%variables defining right panels:
panel_width=230;
setappdata(0,'panel_width', panel_width);

fitting.state = 'normal';
setappdata(0,'fitting_data',fitting);

%content of left panel:
lpanh = uipanel('Parent',fh,'units','pixel','Position',[0 0.2*height panel_width 0.8*height]);
%central panel containing the graphs
cpanh = uipanel('Parent', fh, 'units', 'pixel','Position',[panel_width 0.2*height width-2*panel_width 0.8*height]);
%right panel for options
rpanh = uipanel('Parent',fh,'units', 'pixel','Position',[width-panel_width 0.2*height  panel_width 0.8*height]);
%panel for the results, containing a table
bpanh = uipanel('Parent', fh, 'units', 'pixel' ,'Position', [0 20 width (0.2*height-20)]);
footer=uipanel('Parent', fh, 'units', 'pixel', 'Position', [0 0 width 20]);

%graphs:
dataAxes= axes('Parent', cpanh,'units','pixel', 'outerposition', [0 0.2*0.8*height width-2*panel_width 0.8*0.8*height]);
resAxes= axes('Parent', cpanh,'units','pixel', 'outerposition', [0 0 width-2*panel_width 0.2*0.8*height]);

%set handles for graphs:
setappdata(0,'dataAxes', dataAxes);
setappdata(0,'resAxes', resAxes);

%tabs for right panel:
hTabGroup = uitabgroup('parent',rpanh);


%**********************************************************************
%************************content of leftpan ***************************
%**********************************************************************

site_num_txt=uicontrol(lpanh, 'Style', 'edit','Horizontalalignment','right',...
    'backgroundcolor', [1 1 1], 'string','1', 'Position', [10 453 20 19],...
    'callback', @site_num_txt_edit,'enable','inactive');
site_num_cnt=uicontrol(lpanh, 'style','slider', 'Max', 10, 'Min',1,...
    'value', 1,'SliderStep',[0.05 0.2],'position',[33 453 13 19],...
    'callback', @site_num_cnt_click, 'enable', 'inactive');
func_type=uicontrol(lpanh, 'style', 'popupmenu',...
    'String', {'Lorentzian', 'Gaussian', 'PseudoVoigt', 'LorSquared'},...
    'Position', [55 455 0.45*panel_width 19], 'backgroundcolor', [1 1 1]);
site_type =uicontrol(lpanh, 'style', 'popupmenu',...
    'String', {'Singlet', 'Doublet', 'Sextet'},...
    'Position', [55 428 0.45*panel_width 19], 'backgroundcolor', [1 1 1]);

add_btn=uicontrol(lpanh, 'style', 'Pushbutton', 'String', '+',...
    'Position', [0.75*panel_width 450 40 25], 'callback', @add_btn_click);
delete_btn=uicontrol(lpanh,'style', 'pushbutton', 'string', '-',...
    'Position', [0.75*panel_width 425 40 25], 'callback', @delete_btn_click);


%********************bbdefinine site_param panel**************************
site_pan=uipanel('Parent',lpanh,'units', 'pixel','Position',...
    [05 240 panel_width-10 180],'Title', 'Site params');

uicontrol(site_pan, 'Style', 'text', 'String', 'CS:',...
    'Position', [30 145 35 15],'horizontalalignment', 'right');
cs_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 145 panel_width-130 19], 'callback', @value_cb,...
    'UserData', 'cs');
cs_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 1, 'Position',[panel_width-40 147 15 15],...
    'callback', @cb_click,'UserData', 'fit(1)');

uicontrol(site_pan, 'Style', 'text', 'String', 'FWHM:',...
    'Position', [30 125 35 15],'horizontalalignment', 'right');
fwhm_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 125 panel_width-130 19], 'callback', @value_cb,...
    'UserData', 'fwhm');
fwhm_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 1, 'Position',[panel_width-40 127 15 15],...
    'callback', @cb_click,'UserData', 'fit(2)');

uicontrol(site_pan, 'Style', 'text', 'String', 'Int:',...
    'Position', [30 105 35 15],'horizontalalignment', 'right');
intensity_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 105 panel_width-130 19], 'callback', @value_cb,...
    'UserData', 'intensity');
intensity_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 1, 'Position',[panel_width-40 107 15 15],...
    'callback', @cb_click, 'UserData', 'fit(3)');

uicontrol(site_pan, 'Style', 'text', 'String', 'QS:',...
    'Position', [30 85 35 15],'horizontalalignment', 'right');
qs_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 85 panel_width-130 19], 'callback', @value_cb,...
    'enable','off','UserData', 'qs');
qs_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 0, 'Position',[panel_width-40 87 15 15],...
    'callback', @cb_click,'enable','off', 'UserData', 'fit(4)');

uicontrol(site_pan, 'Style', 'text', 'String', 'BHF:',...
    'Position', [30 65 35 15],'horizontalalignment', 'right');
bhf_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 65 panel_width-130 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'bhf');
bhf_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 0, 'Position',[panel_width-40 67 15 15],...
    'callback', @cb_click,'enable','off', 'UserData', 'fit(6)');

uicontrol(site_pan, 'Style', 'text', 'String', 'A12:',...
    'Position', [30 45 35 15],'horizontalalignment', 'right');
A12_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 45 panel_width-130 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'a12');
A12_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 0, 'Position',[panel_width-40 47 15 15],...
    'callback', @cb_click, 'enable','off', 'UserData', 'fit(5)');

uicontrol(site_pan, 'Style', 'text', 'String', 'A13:',...
    'Position', [30 25 35 15],'horizontalalignment', 'right');
A13_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 25 panel_width-130 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'a13');
A13_cb=uicontrol(site_pan,'style', 'checkbox', 'String','',...
    'Value', 0, 'Position',[panel_width-40 27 15 15],...
    'callback', @cb_click, 'enable','off', 'UserData', 'fit(7)');

uicontrol(site_pan, 'Style', 'text', 'String', 'Ratio:',...
    'Position', [30 05 35 15],'horizontalalignment', 'right');
pv_n_txt=uicontrol(site_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [80 05 panel_width-130 19], 'callback', @pv_n_txt_callback,...
    'enable','off');

%*********************background pan
bkg_pan=uipanel('Parent',lpanh,'units', 'pixel','Position',...
    [05 190 panel_width-10 45],'Title', 'Background');

uicontrol(bkg_pan, 'Style', 'text', 'String', 'Polynom:',...
    'Position', [30 10 60 15],'horizontalalignment', 'right');
polynom_type=uicontrol(bkg_pan, 'style', 'popupmenu',...
    'String', {'0th order', '1st order', '2nd order', '3rd order'},...
    'Position', [95 14 panel_width-130 15], 'backgroundcolor', [1 1 1]);
%********************status pan:

status_pan=uipanel('Parent',lpanh,'units', 'pixel','Position',...
    [05 05 panel_width-10 150],'Title', 'Status');
status_txt=uicontrol(status_pan, 'Style', 'text', 'String', '',...
    'Position', [10 10 panel_width-35 120],'horizontalalignment', 'left',...
    'backgroundcolor', [1 1 1]);




fit_btn=uicontrol(lpanh, 'style', 'pushbutton',...
    'string', 'Fit', 'Position', [75 155 0.6*panel_width 30],...
    'callback', @fit_btn_click);
stop_btn=uicontrol(lpanh, 'style', 'pushbutton',...
    'string', 'STOP', 'Position', [75 155 120 30],...
    'callback', @stop_btn_click,'visible','off');
ft_cb=uicontrol(lpanh,'style', 'checkbox', 'String','FT',...
    'Value', 0, 'Position',[30 162 40 15],...
    'callback', @ft_cb_click);

%**************************************************************************
%*************************** bpanh*****************************************
%**************************************************************************

datatable=uitable(bpanh, 'ColumnName', {'CS', 'error', 'FWHM', 'error', ...
    'Int', 'error', 'QS', 'error', 'BHF', 'error', 'type', 'n', 'error',...
    'a12','error', 'a13', 'error'},...
    'Position', [0 0 width (0.2*height-20)], 'Columnwidth', {44},...
    'RowName',[]);

%**************************************************************************
%***************************footer*****************************************
%*************************************************************************

reference_lbl=uicontrol(footer, 'Style', 'text', 'String', 'written by C. Prescher',...
    'Position', [width/2 0 width/2-10 15],'horizontalalignment', 'right');

output_lbl=uicontrol(footer, 'Style', 'text', 'String', '',...
    'Position', [10 0 width/2-10 15],'horizontalalignment', 'left');

%**************************************************************************
%*************************** rpanh*****************************************
%**************************************************************************
tab1 = uitab('parent',hTabGroup, 'title','Gen');
      

load_btn=uicontrol(tab1, 'style', 'pushbutton',...
    'string', 'Load data', 'Position', [05 410 panel_width-110 30],...
    'callback', @load_btn_click);

fold_cb=uicontrol(tab1,'style', 'checkbox', 'String','autofold',...
    'Value', 1, 'Position',[panel_width-85 420 80 15]);
cal_cb=uicontrol(tab1,'style', 'checkbox', 'String','calibrated',...
    'Value', 0, 'Position',[panel_width-85 390 80 15], 'callback', @cal_cb_click);

cal_btn=uicontrol(tab1, 'style', 'pushbutton',...
    'string', 'Calibrate', 'Position', [05 380 panel_width-110 30],...
    'callback', @cal_btn_click);

%*********calibration panel
std_pan=uipanel('Parent',tab1,'units', 'pixel','Position',...
    [05 287 panel_width-15 90],'Title', 'Calibration');
uicontrol(std_pan, 'Style', 'text', 'String', 'Max_vel:',...
    'Position', [panel_width-160 53 60 15],'horizontalalignment', 'right');
maxv_txt=uicontrol(std_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-85 53 60 19], 'callback', @maxv_txt_cb);
uicontrol(std_pan, 'Style', 'text', 'String', 'Std. CS:',...
    'Position', [panel_width-160 33 60 15],'horizontalalignment', 'right');
stdcs_txt=uicontrol(std_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-85 33 60 19], 'callback', @stdcs_txt_cb);
sin_cb=uicontrol(std_pan,'style', 'checkbox', 'String','sinusoidal',...
    'Value', 0, 'Position',[panel_width-90 10 70 15], 'callback', @sin_cb_click);
flip_btn=uicontrol(std_pan, 'style', 'pushbutton',...
    'string', 'Flip Signs', 'Position', [05 5 panel_width-140 27],...
    'callback', @flip_btn_click);


%***********save panel*************************
save_pan=uipanel('Parent',tab1,'units', 'pixel','Position',...
    [05 200 panel_width-15 80]);

save_graph_btn=uicontrol(save_pan, 'style', 'pushbutton',...
    'string', 'Save Graph', 'Position', [05 40 0.4*panel_width 30],...
    'callback', @save_graph_btn_click);

save_data_btn=uicontrol(save_pan, 'style', 'pushbutton',...
    'string', 'Save Data', 'Position', [0.5*panel_width 40 0.4*panel_width 30],...
    'callback', @save_data_btn_click);

save_sites_btn=uicontrol(save_pan, 'style', 'pushbutton',...
    'string', 'Save Sites', 'Position', [05 05 0.4*panel_width 30],...
    'callback', @save_sites_btn_click);

load_sites_btn=uicontrol(save_pan, 'style', 'pushbutton',...
    'string', 'Load Sites', 'Position', [0.5*panel_width 05 0.4*panel_width 30],...
    'callback', @load_sites_btn_click);

%***********FT options**************************************

ft_pan=uipanel('Parent',tab1,'units', 'pixel','Position',...
    [05 110 panel_width-15 80], 'Title', 'Full Transmission Int');

uicontrol(ft_pan, 'Style', 'text', 'String', 'FWHM src:',...
    'Position', [panel_width-160 45 60 15],'horizontalalignment', 'right');
fwhm_s_txt=uicontrol(ft_pan,'style','edit', 'string','0.097',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-85 45 60 19], 'callback', @fwhm_s_txt_cb);
uicontrol(ft_pan, 'Style', 'text', 'String', 'FT factor:',...
    'Position', [panel_width-160 25 60 15],'horizontalalignment', 'right');
ft_factor_txt=uicontrol(ft_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-85 25 60 19], 'callback', @ft_factor_txt_cb);
lor2_cb=uicontrol(ft_pan,'style', 'checkbox', 'String','Lor2 SrcFunc',...
    'Value', 0, 'Position',[panel_width-110 5 90 15],...
    'callback', @lor2_cb_click);

%calibration of source profile:
src_cal_pan=uipanel('Parent',tab1,'units', 'pixel','Position',...
    [05 40 panel_width-15 70], 'Title', 'Source Calibration');

uicontrol(src_cal_pan, 'Style', 'text', 'String', 'Calib. FWHM:',...
    'Position', [panel_width-200 35 100 15],'horizontalalignment', 'right');
src_calib_txt=uicontrol(src_cal_pan,'style','edit', 'string','0.097',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-85 35 60 19], 'callback', @src_calib_txt_cb);
src_calib_btn=uicontrol(src_cal_pan, 'style', 'pushbutton',...
    'string', 'Calibrate', 'Position', [0.5*panel_width 05 0.4*panel_width 27],...
    'callback', @src_calib_btn_click);

%make report btn...

report_btn=uicontrol(tab1, 'style', 'Pushbutton',...
    'string', 'Create report', 'Position', [05 05 panel_width-15 30],...
    'callback', @report_btn_click);


%*********************bounds tab***************************
%*************************************************************
tab2 = uitab('parent',hTabGroup, 'title','Bnds');

bounds_pan=uipanel('Parent',tab2,'units', 'pixel','Position',...
    [10 270 panel_width-20 170]);
uicontrol(bounds_pan, 'Style', 'text', 'String', 'Min',...
    'Position', [45 155 panel_width-160 15],'horizontalalignment', 'center');
uicontrol(bounds_pan, 'Style', 'text', 'String', 'Max',...
    'Position', [panel_width-95 155 panel_width-160 15],'horizontalalignment', 'center');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'CS:',...
    'Position', [05 135 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 135 20 15],'horizontalalignment', 'center');
cs_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 135 panel_width-160 19], 'callback', @value_cb,...
    'UserData', 'cs_min');
cs_max_txt=uicontrol(bounds_pan,'style','edit', 'string','2',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 135 panel_width-160 19], 'callback', @value_cb,...
    'UserData', 'cs_max');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'FWHM:',...
    'Position', [05 115 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 115 20 15],'horizontalalignment', 'center');
fwhm_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 115 panel_width-160 19], 'callback', @value_cb,...
    'UserData', 'fwhm_min');
fwhm_max_txt=uicontrol(bounds_pan,'style','edit', 'string','2',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 115 panel_width-160 19], 'callback', @value_cb,...
    'UserData', 'fwhm_max');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'Int:',...
    'Position', [05 95 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 95 20 15],'horizontalalignment', 'center');
intensity_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 95 panel_width-160 19], 'callback', @value_cb,...
    'UserData', 'intensity_min');
intensity_max_txt=uicontrol(bounds_pan,'style','edit', 'string','0',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 95 panel_width-160 19], 'callback', @value_cb,...
    'UserData', 'intensity_max');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'QS:',...
    'Position', [05 75 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 75 20 15],'horizontalalignment', 'center');
qs_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 75 panel_width-160 19], 'callback', @value_cb,...
    'enable','off','UserData', 'qs_min');
qs_max_txt=uicontrol(bounds_pan,'style','edit', 'string','0',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 75 panel_width-160 19], 'callback', @value_cb,...
    'enable','off','UserData', 'qs_max');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'BHF:',...
    'Position', [05 55 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 55 20 15],'horizontalalignment', 'center');
bhf_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 55 panel_width-160 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'bhf_min');
bhf_max_txt=uicontrol(bounds_pan,'style','edit', 'string','0',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 55 panel_width-160 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'bhf_max');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'A12:',...
    'Position', [05 35 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 35 20 15],'horizontalalignment', 'center');
A12_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 35 panel_width-160 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'a12_min');
A12_max_txt=uicontrol(bounds_pan,'style','edit', 'string','0',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 35 panel_width-160 19], 'callback', @value_cb,...
    'enable','off','UserData', 'a12_max');

uicontrol(bounds_pan, 'Style', 'text', 'String', 'A13:',...
    'Position', [05 15 35 15],'horizontalalignment', 'right');
uicontrol(bounds_pan, 'Style', 'text', 'String', '-',...
    'Position', [panel_width-115 15 20 15],'horizontalalignment', 'center');
A13_min_txt=uicontrol(bounds_pan,'style','edit', 'string','',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [45 15 panel_width-160 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'a13_min');
A13_max_txt=uicontrol(bounds_pan,'style','edit', 'string','0',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [panel_width-95 15 panel_width-160 19], 'callback', @value_cb,...
    'enable','off', 'UserData', 'a13_max');


%**************constraints panel:

constraints_pan=uipanel('Parent',tab2,'units', 'pixel','Position',...
    [10 105 panel_width-20 160], 'title', 'Constraints');

con_num_txt=uicontrol(constraints_pan, 'Style', 'edit','Horizontalalignment','right',...
    'backgroundcolor', [1 1 1], 'string','0', 'Position', [50 120 20 19],...
    'enable','inactive');
con_num_cnt=uicontrol(constraints_pan, 'style','slider', 'Max', 10, 'Min',1,...
    'value', 1,'SliderStep',[0.05 0.2],'position',[73 120 13 19],...
    'callback', @con_num_cnt_click, 'enable', 'inactive');
add_con_btn=uicontrol(constraints_pan, 'style', 'pushbutton',...
    'string', 'add', 'Position', [90 115 panel_width-120 25],...
    'callback', @add_con_btn_click);

uicontrol(constraints_pan, 'Style', 'text', 'String', 'Var1:',...
    'Position', [05 92 35 15],'horizontalalignment', 'right');
site1_number_pop=uicontrol(constraints_pan, 'style', 'popupmenu',...
    'String', {' '},...
    'Position', [50 92 55 19], 'backgroundcolor', [1 1 1],...
    'callback', @site1_number_pop_cb);
site1_var_pop=uicontrol(constraints_pan, 'style', 'popupmenu',...
    'String', {' '},...
    'Position', [110 92 panel_width-140 19], 'backgroundcolor', [1 1 1]);

uicontrol(constraints_pan, 'Style', 'text', 'String', 'Var2:',...
    'Position', [05 67 35 15],'horizontalalignment', 'right');
site2_number_pop=uicontrol(constraints_pan, 'style', 'popupmenu',...
    'String', {' '},...
    'Position', [50 67 55 19], 'backgroundcolor', [1 1 1],...
    'callback',@site2_number_pop_cb);
site2_var_pop=uicontrol(constraints_pan, 'style', 'popupmenu',...
    'String', {' '},...
    'Position', [110 67 panel_width-140 19], 'backgroundcolor', [1 1 1]);

uicontrol(constraints_pan, 'Style', 'text', 'String', 'Factor:',...
    'Position', [05 37 35 15],'horizontalalignment', 'right');
con_factor_txt=uicontrol(constraints_pan,'style','edit', 'string','1',...
    'backgroundcolor', [1 1 1], 'horizontalalignment', 'right',...
    'Position', [50 37 35 19], 'callback', @con_factor_txt_cb);

save_con_btn=uicontrol(constraints_pan, 'style', 'pushbutton',...
    'string', 'save', 'Position', [90 32 panel_width-120 25],...
    'callback', @save_con_btn_click);
del_con_btn=uicontrol(constraints_pan, 'style', 'pushbutton',...
    'string', 'delete', 'Position', [90 5 panel_width-120 25],...
    'callback', @del_con_btn_click);

%*********************************xVBF tab********************************
%***********************************************************************

tab3 = uitab('parent',hTabGroup, 'title','xVBF');

tab3_c=cxVBF(tab3);

set(tab3_c.qsd_axes,'nextplot','add');
set(tab3_c.csd_axes,'nextplot','add');


%*********************************options tab*****************************
%*************************************************************************

tab5=uitab('parent', hTabGroup,'title','opt');

tab5_content=coptions(tab5);

%**************************************************************************
%***********************Initialize Variables*******************************
%**************************************************************************
data.x=linspace(-10,10,512);
%data.y=1e5-doublet(0.2,0.4,500,0.7,0.5,data.x)-doublet(1.1,0.4,800,2.1,0.5,data.x);
data.y=1e5-sextet(0 ,0.4,800,0,1.5, 33, 3, data.x);
noise=0.2*randn(1,length(data.y))*sqrt(max(data.y)-min(data.y));
data.y=data.y+noise;

%normalize to 100!

setappdata(0,'data',data);
setappdata(0,'I0',max(data.y));

%initiate variables
site_y(1:length(data.x))=NaN;
site_h=plot(data.x,site_y,'g-');
site(1)=csite(1,2,3,site_h);

setappdata(0,'residual', site_y);
setappdata(0,'site_data',site);
setappdata(0,'site_cur',1);
setappdata(0,'site_num',0);
setappdata(0,'fwhm_s', 0.097);
setappdata(0,'ft_fit', 0);
setappdata(0,'ft_scale',1);
setappdata(0,'ft_factor',1);
setappdata(0,'ft_y',[]); %fitted y for the full transmission integral
setappdata(0,'ft_lor2',0); %variable if Lorentzian squared should be used as srce funcion
setappdata(0,'src_calib_fwhm', 0.097); %variable for calibration of the src

setappdata(0,'sinusoidal',0)

%constraints stuff_
setappdata(0, 'con_num',0);
setappdata(0, 'con_cur',0);
setappdata(0, 'con_matrix', [0 0 0 0 0]); %saving the data for the constraints
                                          %as [site1 var site2 var factor] 
                                          
%background stuff:
setappdata(0, 'bkg_param', [0 0 0 0]);
setappdata(0, 'bkg_order', 1);

    function createHandles()
        data=getappdata(0,'data');
        site=getappdata(0,'site_data');
        bkgOrder=getappdata(0,'bkg_order');
        bkgParam=getappdata(0,'bkg_param');
        I0=getappdata(0,'I0');
        
        siteNum=getappdata(0,'site_num');
        siteCur=getappdata(0,'site_cur');
              
        axes(dataAxes);
        %%first find opimal x and y range:
        %set axis properly
        %y Axis
        data_ymax=max(data.y);
        data_ymin=min(data.y);
        yrange=data_ymax-data_ymin;
        YLim(1)=data_ymin-yrange*0.1;
        YLim(2)=data_ymax+yrange*0.1;

        %x Axis
        data_xmax=max(data.x);
        data_xmin=min(data.x);
        xrange=data_xmax-data_xmin;
        XLim(1)=data_xmin-xrange*0.05;
        XLim(2)=data_xmax+xrange*0.05;
        xlim(XLim);
        ylim(YLim);
        
        
        
        %create data handle and background handle:        
        data.h=plot(data.x,data.y,'k.'); 
        hold on;
        
        %bkg:
        y=ones(1,length(data.x))*I0;
        for k=2:bkgOrder
           y=y-bkgParam(k)*data.x.^(k-1);
        end
        bkg_h=plot(data.x,y,'b-');
        
        %site spectra        
        for k=1:siteNum
           site_y=y-site(k).calc(data.x);
           site(k).line_h=plot(data.x,site_y,'-b');
           if k==siteCur
              set(site(k).line_h,'color','r');
           end
        end
        
        %sum spectra:
        if ~getappdata(0,'ft_fit')   
           for k=1:siteNum
              y=y-site(k).calc(data.x);           
           end
           sum_h=plot(data.x,y,'g-','linewidth',2);
        else
           sum_h=plot(data.x, getappdata(0,'ft_y'),'g-','linewidth',2);
        end
        hold off;
        
        %initiate the residual
        res_h=plot(resAxes,data.x,getappdata(0,'residual'),'b.');        
        set(resAxes,'xlim',XLim);
        
        data.XLim=XLim;
        data.YLim=YLim;
        set(dataAxes,'ylim',YLim);
        set(dataAxes,'xlim',XLim);
        
        %save all the handles:
        setappdata(0,'site_data',site);
        setappdata(0,'data',data);
        setappdata(0,'res_h',res_h); 
        setappdata(0,'sum_h',sum_h);                    
        setappdata(0,'bkg_h',bkg_h); 
        resize_graphs();
        
        %now the xVBF plots:
        if site(siteCur).fit_method==2
            tab3_c.delete_graph_handles();
            tab3_c.create_graph_handles();
        end
    end

setappdata(0,'createHandles',@createHandles);
createHandles();


%if we wish to stop the fitting
setappdata(0, 'stop_fitting',0);
%set(hTabGroup,'selectedindex',1);

addpath(pwd);


%load calibration data, if it was determined before:
if ismac
    if exist('~/.MossA/calibration.txt')
        calibration_filename = '~/.MossA/calibration.txt';
    else
        calibration_filename = '';
    end
else
    %windows or unix, saves the calibration in the same folder as the
    %program
    if exist('calibration.txt')
        calibration_filename = 'calibration.txt';
    else
        calibration_filename = '';
    end
end
if ~strcmp(calibration_filename,'')
    calibration=dlmread(calibration_filename);
    set(maxv_txt,'String', calibration(1));
    set(stdcs_txt,'String', calibration(2));
    setappdata(0,'maxv', calibration(1));
    setappdata(0,'stdcs', calibration(2));
else
    set(maxv_txt,'String', 5);
    set(stdcs_txt,'String', 0);
    setappdata(0,'maxv', 5);
    setappdata(0,'stdcs', 0); 
end

resize_graphs();

guidata(fh,handles);
setappdata(0, 'state', 'normal');

set(fh,'visible', 'on');
movegui(fh,'onscreen');

%**************************************************************************
%**************functionality for lpanh*************************************
%**************************************************************************
    function add_btn_click(~, ~)
        fitting = getappdata(0,'fitting_data');
        if strcmp(fitting.state,'normal')
            fitting.state='define1';
            setappdata(0,'fitting_data',fitting);
            
            site_num=getappdata(0,'site_num')+1;
            setappdata(0,'site_num',site_num);
            setappdata(0,'site_cur',site_num);

            %define initial values
            site=getappdata(0,'site_data');
            data=getappdata(0,'data');
            clear site_y;
            site_y(1:length(data.x))=NaN;
            axes(dataAxes);
            hold on;
            
            length(data.x);
            length(site_y);
            line_h=plot(data.x,site_y,'r-');
            %vertical line
            line_ver_h=plot([0 0], [NaN NaN],'r--');
            line_hor_h=plot([min(data.x) max(data.x)], [NaN NaN],'r--');
            hold off;
            
            setappdata(0,'line_ver_h',line_ver_h);
            setappdata(0,'line_hor_h',line_hor_h);
            
            site(site_num)=csite(0,0.2,min(data.y),line_h);
            site(site_num).intensity_max=inf;

            type=get(site_type,'String');

            site(site_num).type=type(get(site_type,'Value'));
            
            type=get(func_type,'String');
            site(site_num).func_type=type(get(func_type, 'Value'));

            if strcmp(site(site_num).func_type, 'PseudoVoigt')
                site(site_num).n=0.5;
            end
            if strcmp(site(site_num).func_type, 'FT_Lor2')
                site(site_num).ta=2;
            end
            setappdata(0,'site_data', site);
            update_txt();

            %define the slider things
            set(site_num_txt, 'String', site_num);
            if site_num>=2
                set(site_num_cnt, 'Enable','on');
                set(site_num_cnt, 'Max', site_num);
                set(site_num_cnt, 'Min', 1);
                set(site_num_cnt, 'Value' , site_num);
                set(site_num_cnt, 'SliderStep', [1/(site_num-1) 5]);
                for k=1:site_num-1
                   set(site(k).line_h,'color','b'); 
                end
            end
            %delete the possible graph handles in xVBF
            tab3_c.delete_graph_handles();
            tab3_c.update();
        end        
    end

    function delete_btn_click(~, ~)
        site=getappdata(0,'site_data');
        site_cur=getappdata(0,'site_cur');
        site_old=getappdata(0,'site_data');
        site_num=getappdata(0,'site_num');
        counter=0;
        
        if site_num>0
            site(site_cur).delete_h();
        end
       
        %saving the con matrix of the deleted site:
        if site_num>1
            for k=1:site_num
                if k~=site_cur
                    counter=counter+1;
                    site_new(counter)=site_old(k);
                end
            end
            setappdata(0,'site_data', site_new);
            site=site_new;
            site_num=site_num-1;
        else
            site_num=0;
        end
        setappdata(0,'site_num', site_num);
        %slider mist:
        if site_cur>1
            site_cur=site_cur-1;
        else
            site_cur=1;
            %reset the textboxes
            if site_num>=1

            else
                set(cs_txt,'String','');
                set(fwhm_txt,'String',0.19);
                set(intensity_txt,'String','');
            end
        end

        set(site_num_txt, 'String', site_cur);
        set(site_num_cnt, 'Value', site_cur);
        setappdata(0,'site_cur', site_cur);

        if site_num>1
            set(site_num_cnt, 'Enable','on');
            if site_num>=2
              set(site_num_cnt, 'SliderStep', [1/(site_num-1) 5]); 
              set(site_num_cnt, 'Max', site_num);
            end
            
        else
            set(site_num_cnt, 'Enable', 'off');
            set(site_num_txt, 'String', 1);
        end
        if site_num>0
            set(site_new(site_cur).line_h,'color','r');
            
        end
        update_sum();
        update_txt();  
        
        %managing the graph handles in 
        tab3_c.delete_graph_handles();
        if site_num>0
            tab3_c.create_graph_handles(); 
        else
            tab3_c.xVBF_off;
            set(tab3_c.convert_cb,'enable', 'off');
        end
        
        
        %now the constraints accompanied with the site should be
        %deleted...
        
        %sort the absolute values and now delete the constraints from
        %above....
               
    end
    

    function site_num_cnt_click(hObject, ~)
        set(site_num_txt,'String', get(hObject, 'Value'));
        site_cur=get(hObject, 'Value');
        site_num=getappdata(0,'site_num');
        site=getappdata(0,'site_data');
        setappdata(0,'site_cur', site_cur);
        
        for k=1:site_num
            if k==site_cur
                set(site(k).line_h,'color','r');
            else
                set(site(k).line_h,'color','b');
            end   
        end               
        update_txt();        
    end

    function value_cb(hObject, ~)
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
            str=['site(site_cur).',get(hObject, 'UserData'),'=str2double(get(hObject,''String''))'];
            eval(str);
            setappdata(0,'site_data',site);
            site(site_cur).update_h();
            update_sum();
        end                
    end    
   

    function cb_click(hObject, ~)
        old_value=get(hObject, 'Value');
        site=getappdata(0,'site_data');
        site_cur=getappdata(0,'site_cur');
        str=['site(site_cur).',get(hObject, 'UserData'),'=old_value;'];
        eval(str);
        setappdata(0,'site_data', site);
        update_txt();
    end

%function um intensities zu �ndern wenn man in den FT_modus wechselt
    function y=ft_calib_func(x,xdata)
        if getappdata(0, 'ft_lor2')
           y1=lorentz_squared(0,0.097,1,xdata); 
        else               
           y1=lorentz_curve(0,0.097,1,xdata); 
        end
        
        y2=exp(-lorentz_curve(0,0.097,x,xdata));
        
        y_model=conv(y1,y2,'same');
        I0=getappdata(0,'I0');
        y=I0/100*y_model;
    end

    function ft_cb_click(hObject,~)
        value=get(hObject,'Value');
        setappdata(0,'ft_fit', value);
        
        site=getappdata(0,'site_data');    
        site_num=getappdata(0,'site_num');
        data=getappdata(0,'data');
        I0=getappdata(0,'I0');
        %changing intensities of sites, to be more in the range
        if value
            %if FT is selected
            ival=1;
            %wir definieren eine Lorentzcurve mit der range vom spektrum
            %und fitten dann das FT_integral dazu um eine ungef�hre
            %approximation zu haben
            xdata=-5:0.01:5;
            ydata=I0-lorentz_curve(0,0.194,(I0-min(data.y))*pi*0.097,xdata);
            param=lsqcurvefit(@ft_calib_func,ival,xdata,ydata);
            
            height=param/(pi*0.0485);
            %the approximate height of the highes peak with full
            %transmission integral
            
            %changing all intensities of the sites
            for k=1:site_num
               site_height=site(k).intensity/(pi*site(k).hwhm);
               site(k).intensity=site_height/(I0-min(data.y))*height;
            end        
            
            %calculating new ft_factor
            ft_factor=(I0-min(data.y))/height;
            setappdata(0,'ft_factor',ft_factor);
            set(ft_factor_txt,'String', ft_factor);       
        else
            
           %change intensities           
           for k=1:site_num
               
               height=max(site(k).calc(data.x));                              
               new_height=height*getappdata(0, 'ft_factor');
               site(k).intensity=new_height*pi*site(k).hwhm;
           end
        end
        
        %changing FWHM minimum value to an the real or double  FWHM     
        for k=1:site_num
           if get(hObject, 'Value')
              if site(k).fwhm_min==0.194
                  site(k).fwhm_min=0.097;
              end
           else
              if site(k).fwhm_min==0.097
                 site(k).fwhm_min=0.194; 
              end
           end
        end
        setappdata(0,'site_data',site);
        if site_num>0
            update_txt();
        end
        
        %saving the new data 
        if value
           y=get(getappdata(0,'sum_h'),'ydata');
           setappdata(0,'ft_y', y);
        end
        %changing the plots
        for k=1:site_num
            site(k).update_h();
        end
        update_sum();
    end

    function fit_btn_click(hObject, ~)
        site_num=getappdata(0,'site_num');
        if site_num>0
            site=getappdata(0,'site_data');

            set(hObject, 'visible' , 'off');
            set(stop_btn,'visible' , 'on');
            setappdata(0,'stop_fitting',0);

            %fitting procedure
            ft_fit=getappdata(0,'ft_fit');
            if ft_fit
                fwhm_s=getappdata(0,'fwhm_s');
                fitting=cft_fit(status_txt,dataAxes, site, get(polynom_type,'Value'), fwhm_s);
                [site, table,residual, y]=fitting.process();  
                if ~getappdata(0,'stop_fitting')
                    setappdata(0,'ft_y',y);
                    set(ft_factor_txt,'String', getappdata(0,'ft_factor'));
                end
            else
                fitting=cfit(status_txt,dataAxes, site, get(polynom_type,'Value'));
                [site, table,residual, y]=fitting.process();
            end


            clear fitting;  
            setappdata(0,'site_data',site);
            setappdata(0,'residual',residual);
            set(datatable, 'Data', table);

            %update all the sites and sum        
            site_num=getappdata(0,'site_num');
            for k=1:site_num
                site(k).update_h();
            end
            update_sum();

            update_txt();
            resize_graphs();            
            
            %update residual
            set(getappdata(0,'res_h'),'ydata',residual);       

            %some other tasks
            set(hObject,'enable','on');
            set(hObject, 'visible','on');
            set(stop_btn,'visible','off');
            setappdata(0,'stop_fitting',0);
            
            
            
            tab3_c.delete_graph_handles();
            tab3_c.create_graph_handles();
            tab3_c.update();
        else
            %%give error messages
            str=cellstr(get(status_txt, 'String'));                
            str=[str; cellstr('Please define sites.')];
            %now lift the text upwards if there are too many lines
            if length(str)>8
                new_str=str(2:9);
                str=new_str;
            end
            set(status_txt, 'String',str);
            
        end
    end

%if we wish to stop the fitting:
    function stop_btn_click(~, ~)
        %%give message that it was stopped by the user
        str=cellstr(get(status_txt, 'String'));                
        str=[str; cellstr('Fitting stopped by user.')];
        %now lift the text upwards if there are too many lines
        if length(str)>8
            new_str=str(2:9);
            str=new_str;
        end
        set(status_txt, 'String',str);
        setappdata(0,'stop_fitting',1);
    end

%**************************************************************************
%**************functionality for rpanh*************************************
%**************************************************************************

    function load_btn_click(~, ~)
        work_path=getappdata(0, 'work_path');
        [file, path]=uigetfile([work_path,'*.*'], 'Select Data-File');
        if path
            setappdata(0,'work_path', path);
            %search for the real file name:
            ind=strfind(file,'.');
            if isempty(ind)
                setappdata(0,'file',file);
            else
                setappdata(0,'file',file(1:ind-1));
            end
            fold_bool=get(fold_cb, 'Value');
            cal_bool=get(cal_cb,'Value');
            misc=[];
            if ~cal_bool
                %check format of file
                fid=fopen([path,file]);
                data_s{1}=fgetl(fid); %reading first line
                if data_s{1}(1)=='<'
                    file
                    n=1;
                    %read every line until end of file into array
                    while ~feof(fid)
                        line_str = fgetl(fid);
                        if line_str(1) ~= '<'
                            n=n+1;
                            data_s{n}=line_str;
                        end
                    end
                   
                     %cut the last string of the normal M�ssbauer files
                    n=1;
                    try
                        while data_s{end}(n)~='<'
                           n=n+1; 
                        end
                        data_s{end}=data_s{end}(1:n-1);
                    catch exception
                        exception
                    end
                    
                    
                    %convert into a double array
                    data=[];
                    data=ones(512,1);
                    for i=1:512
                       data(i)=str2double(data_s{i+1});
                    end 
                elseif data_s{1}(1)=='#'
                    %this is characteristic for the mca files of the
                    %beamline
                    n=1;
                    %read every line until end of file into array
                    while ~feof(fid)
                        n=n+1;
                        data_s{n}=fgetl(fid);
                    end
                    %delete the @a in the first row
                    data_n{1}=data_s{9}(4:end-2);
                    
                    %delete the "\" at the end of the line
                    for k=10:72
                       data_n{k-8}=data_s{k}(1:end-2);
                    end
                    %read the data
                    data=[];
                    for k=1:64
                        temp=sscanf(data_n{k},'%f',16);
                        data=[data temp'];
                    end      
                else %suggesting that it is a plain file without header and any string...
                  data=load([path,file]);
                  if size(data)==[64 16]
                      temp=[];
                      for k=1:64
                         temp=[temp data(k,:)]; 
                      end
                      data=temp;
                  end
                  
                end

                fclose(fid);

                %start folding procedure of the data:
                if fold_bool
                    pfp=getfp(data);
                    fdata=fold(data, round(2*pfp.center)/2);
                else
                  fdata=folding(data);
                end
                set(fh,'Name',['MossA ',version,'  -  ', file]); 
                %plotting data with correct corrected velocity and central shift
                maxv=getappdata(0,'maxv');
                stdcs=getappdata(0,'stdcs');

                misc.y=fdata;

                data_length=length(misc.y);
                misc.x=[];
                if getappdata(0,'sinusoidal')
                   misc.x=-cos((0:data_length-1)/(data_length-1)*pi)*maxv-stdcs; 
                else
                   maxv
                   misc.x=-maxv+2.*maxv/(data_length-1).*(0:(data_length-1))-stdcs;
                end
            else
                data=load([path,file]);
                misc.x=[];
                misc.x=data(:,1)';
                misc.y=data(:,2)';
%                 factor=1/max(misc.y);
%                 misc.y=misc.y.*factor;
            end


            set(fh,'Name',['MossA ',version,' -  ', file]); 
            %set axis properly
            %y Axis
            data_ymax=max(misc.y);
            data_ymin=min(misc.y);
            yrange=data_ymax-data_ymin;
            YLim(1)=data_ymin-yrange*0.1;
            YLim(2)=data_ymax+yrange*0.1;
%             misc.YLim=YLim;

            %x Axis
            data_xmax=max(misc.x);
            data_xmin=min(misc.x);
            xrange=data_xmax-data_xmin;
            XLim(1)=data_xmin-xrange*0.05;
            XLim(2)=data_xmax+xrange*0.05;
            misc.XLim=XLim;
            
            old_data=getappdata(0,'data');
            misc.h=old_data.h;
            setappdata(0, 'data', misc);
            setappdata(0, 'I0',max(misc.y));

            %plot all again but reset ft status befor
            setappdata(0,'ft_fit',0);
            set(ft_cb,'value',0);
            
            
            %bkg reset to zero
            
            set(getappdata(0,'bkg_h'),'xdata',misc.x);
            clear bkg_y;
            bkg_y(1:length(misc.x))=max(misc.y);
           
            set(getappdata(0,'bkg_h'),'ydata',bkg_y);
            set(getappdata(0,'bkg_h'),'xdata',misc.x);
            
            %data_h reset
            set(misc.h,'xdata',misc.x);
            set(misc.h,'ydata',misc.y);
            axes(dataAxes);
            
            %update alle the lines
            site=getappdata(0,'site_data');
            site_num=getappdata(0,'site_num');
            
            for k=1:site_num
               set(site(k).line_h,'xdata',misc.x);
               site(k).update_h();               
            end
            
               
            %update der summe
            set(getappdata(0,'sum_h'),'xdata',misc.x);
            update_sum();
            
            xlim(XLim);
            ylim(YLim);
            
            %update residual
            set(resAxes,'xlim',XLim);
            junk(1:length(misc.x))=NaN;
            set(getappdata(0,'res_h'),'ydata',junk);
            set(getappdata(0,'res_h'),'xdata',misc.x);
            
            resize_graphs();
            %reset the background
            setappdata(0, 'bkg_param', [0 0 0 0]);
        end          
    end

    function cal_btn_click(~,~)
        work_path=getappdata(0, 'work_path');
        %laden, folding and calibration!
        [file, path]=uigetfile([work_path,'*.*'],'Select data file');
        if path
            setappdata(0,'work_path', path);
            file=[path,file];
            fold_bool=get(fold_cb, 'Value');
            
            fid=fopen(file);
            data_s{1}=fgetl(fid); %reading first line
            if data_s{1}(1)=='<'
                n=1;
                %read every line until end of file into array
                while ~feof(fid)
                    n=n+1;
                    data_s{n}=fgetl(fid);
                end
                %cut the last string of the normal M�ssbauer files
                n=1;
                while data_s{end}(n)~='<'
                   n=n+1; 
                end
                data_s{end}=data_s{end}(1:n-1);
                
                %convert into a double array
                clear data;
                for i=1:512
                   data(i)=str2double(data_s{i+1});
                end        
            else %suggesting that it is a plain file without header and any string...
              data=load(file);
            end

            fclose(fid);

            %start folding procedure of the data:
            if fold_bool
                pfp=getfp(data);
                fdata=fold(data, round(2*pfp.center)/2);
            else
              fdata=folding(data);
            end

            [maxv, stdcs]=calib(fdata);

            %ausgabe der Werte im Textfeld
            set(maxv_txt,'String',maxv);
            set(stdcs_txt,'String', stdcs);

            %abspeichern der Werte
            setappdata(0,'maxv',  maxv);
            setappdata(0,'stdcs', stdcs);
            
            %aendern der velocity scale:
            data=getappdata(0,'data');
            data_length=length(data.x);
            
            if getappdata(0,'sinusoidal')
               data.x=-cos((0:data_length-1)/(data_length-1)*pi)*maxv-stdcs; 
            else
               data.x(1:data_length)=-maxv+2.*maxv/(data_length-1).*(0:(data_length-1))-stdcs;
            end            
            
            %x Axis neu skalieren
            data_xmax=max(data.x);
            data_xmin=min(data.x);
            xrange=data_xmax-data_xmin;
            XLim(1)=data_xmin-xrange*0.05;
            XLim(2)=data_xmax+xrange*0.05;
            data.XLim=XLim;
            set(dataAxes,'xlim',XLim);
            set(resAxes,'xlim',XLim);

            setappdata(0,'data',data)
            update_scales();
            
        end      
    end

    function cal_cb_click(hObject,~)      
        if get(hObject,'value')
            set(maxv_txt,'enable','off');
            set(stdcs_txt,'enable','off'); 
            set(fold_cb,'enable','off'); 
            set(sin_cb,'enable','off'); 
            set(cal_btn,'enable','off'); 
        else
            set(maxv_txt,'enable','on');
            set(stdcs_txt,'enable','on');
            set(fold_cb,'enable','on'); 
            set(sin_cb,'enable','on'); 
            set(cal_btn,'enable','on'); 
        end
    end

    function sin_cb_click(hObject,~)
        setappdata(0,'sinusoidal',get(hObject,'value'))
        
        stdcs=getappdata(0,'stdcs');
        maxv=getappdata(0,'maxv');
        
        data=getappdata(0,'data');
        data_length=length(data.x);

        if getappdata(0,'sinusoidal')
            data.x=-cos((0:data_length-1)/(data_length-1)*pi)*maxv-stdcs; 
        else
            data.x(1:data_length)=-maxv+2.*maxv/(data_length-1).*(0:(data_length-1))-stdcs;
        end
        setappdata(0,'data',data);       
        
        update_scales();
    end

    function maxv_txt_cb(hObject,~)
        str=get(hObject,'string');
        str=strrep(str,',','.');
        var=str2double(str);
        if isnan(var)
           beep;
           set(hObject,'String', getappdata(0,'maxv'));
        else
           set(hObject,'String',var);
           data=getappdata(0,'data');           
           data_length=length(data.x);
           
           maxv=var;
           stdcs=getappdata(0,'stdcs');
           
           if getappdata(0,'sinusoidal')
               data.x=-cos((0:data_length-1)/(data_length-1)*pi)*maxv-stdcs; 
           else
               data.x(1:data_length)=-maxv+2.*maxv/(data_length-1).*(0:(data_length-1))-stdcs;
           end
           
            %x Axis
            data_xmax=max(data.x);
            data_xmin=min(data.x);
            xrange=data_xmax-data_xmin;
            XLim(1)=data_xmin-xrange*0.05;
            XLim(2)=data_xmax+xrange*0.05;
            data.XLim=XLim;
            set(dataAxes,'xlim',XLim);
            set(resAxes,'xlim',XLim);
           
            setappdata(0,'data',data);            
            setappdata(0,'maxv',var);
            
            update_scales();                 
        end
    end

    function stdcs_txt_cb(hObject,~)
        str=get(hObject,'string');
        str=strrep(str,',','.');
        var=str2double(str);
        if isnan(var)
           beep;
           set(hObject,'String', getappdata(0,'stdcs'));
        else
           set(hObject,'String',var);
           data=getappdata(0,'data');           
           data_length=length(data.x);
           
           stdcs=var;
           maxv=getappdata(0,'maxv');
           
           if getappdata(0,'sinusoidal')
               data.x=-cos((0:data_length-1)/(data_length-1)*pi)*maxv-stdcs; 
           else
               data.x(1:data_length)=-maxv+2.*maxv/(data_length-1).*(0:(data_length-1))-stdcs;
           end
            %x Axis
            data_xmax=max(data.x);
            data_xmin=min(data.x);
            xrange=data_xmax-data_xmin;
            XLim(1)=data_xmin-xrange*0.05;
            XLim(2)=data_xmax+xrange*0.05;
            data.XLim=XLim;
            set(dataAxes,'xlim',XLim);
            set(resAxes,'xlim',XLim);
            
            setappdata(0,'stdcs',var);
            setappdata(0,'data',data);   
            
            update_scales();
        end        
    end

    function update_scales()
       %update all the x-scales of sites and data
        data=getappdata(0,'data');
        site=getappdata(0,'site_data');
        site_num=getappdata(0,'site_num');
        for k=1:site_num
            set(site(k).line_h,'xdata',data.x);
            site(k).update_h();
        end
        
        set(data.h,'xdata',data.x);
        set(getappdata(0,'sum_h'),'xdata',data.x);
        update_sum();
        set(getappdata(0,'bkg_h'),'xdata',data.x);
        set(getappdata(0,'res_h'),'xdata',data.x);   
    end

    function flip_btn_click(~,~)
       data=getappdata(0,'data');
       data.x=-data.x;              
       data_xmax=max(data.x);
       data_xmin=min(data.x);
       xrange=data_xmax-data_xmin;
       XLim(1)=data_xmin-xrange*0.05;
       XLim(2)=data_xmax+xrange*0.05;
       data.XLim=XLim;
       set(dataAxes,'xlim',XLim);
       set(resAxes,'xlim',XLim);
       
       setappdata(0,'data',data);
       update_scales();
    end

    %output functions
    function save_graph_btn_click(~, ~)
        set(gcf,'Renderer','OpenGL')
        new_figure=figure;
        new_axes=axes('parent',new_figure);
        create_output_graph(new_axes);
    end

    function [colors,order]=create_output_graph(axes_handle)
        site=getappdata(0,'site_data');
        site_num=getappdata(0,'site_num');
        residual=getappdata(0, 'residual');
        data=getappdata(0,'data');
        axes(axes_handle);
        hold on;
        I0=getappdata(0,'I0');
        all=I0;

        %make the fitted shapes more smooth then the data:
        site_x=min(data.x):0.001:max(data.x);
        %plot background data:
        order=getappdata(0,'bkg_order');
        param=getappdata(0,'bkg_param');
        bkg=0;
        for k=2:order
            bkg=bkg+param(k)*data.x.^(k-1);         
        end
        
        data.y=(data.y+bkg);
        
        %plot all the sites:
        %but with a better resolution
        ft_fit=getappdata(0,'ft_fit');
        ft_factor=getappdata(0,'ft_factor');
        
        y_site=[];
        
        for k=1:site_num
            if ~ft_fit
                y_site(k,:)=site(k).calc(site_x);
            else
                
                y_site(k,:)=ft_factor*site(k).calc(site_x);
            end
            all=all-y_site(k,:);
            y_site(k,:)=I0-y_site(k,:);
            minima(k)=min(y_site(k,:));
        end

        %organizing colors:
        red=0; gr=0.4; blue=0;
        for k=1:site_num
           red=red+0.05;gr=gr+0.15;blue=blue+0.4;
           if red>1
               red=red-1;
           end
           if gr>1
               gr=gr-1;
           end
           if blue>1
               blue=blue-1;
           end
           colors(k,:)=[red gr blue]; 
        end
        
        %order the sites due to their max intensity and plot
        [~,order]=sort(minima);
        for k=1:site_num
            area(site_x, y_site(order(k),:), I0,'FaceColor',colors(k,:));    
        end
        
        %plotting the data + residual
         plot(data.x,data.y,'k.');
            
        %adjust residual height
        residual=-residual;
        adjust=-min(residual)+range(data.y)*0.05+max(max(all), max(data.y));
        
        residual=residual+adjust;
        plot(data.x,residual,'r.');
        %plot a line:
        x=[min(data.x) max(data.x)];
        y=[adjust adjust];
        plot(x,y,'k-');

        %plot sum of the fitted data
        if site_num>0
            if ~ft_fit
                plot(site_x, all, 'r-','linewidth', 1.5);
            else
                ft_y=getappdata(0,'ft_y');
                ft_y=ft_y+bkg';
                plot(data.x,ft_y,'r-','linewidth', 1.5);
            end
        end    

        %now some cosmetic features:
        xlabel('velocity (mm/s)');
        ylabel('counts');
        xlim([min(data.x) max(data.x)])
        hold off;
    end

    function report_btn_click(~,~)     
        %first need to open a file
        work_path=getappdata(0,'work_path');
        
        if length(work_path)==0
            work_path=pwd;
        end
        old_folder=cd(work_path);
        [file,path,FilterIndex] = uiputfile({'*.pdf'; '*.eps'},...
            'Report a plot and the fitted parameters');
        if path
            out_fig=figure('Visible','off', 'units','centimeters', ...
                'Position', [0 0 21 18],'PaperPosition', [0 0 21 29.7]);
            out_text=axes('parent',out_fig,'units','centimeters','position',[3 0 15 10],...
                'Xlim', [0 12],'YLim', [0 20]);
            axis off;
            out_graph=axes('parent', out_fig,'units','centimeters', 'outerposition', [2 10.0 17.0 14.0]);
            
            set(out_graph,'Title',text('String',get(fh,'name'),'Color','k','interpreter','none'))
            [colors, order]=create_output_graph(out_graph);

            %*******************************************
            %****************now the text stuff:*********
            %*******************************************
            
            site=getappdata(0,'site_data');
            site_num=getappdata(0,'site_num');

            %column headers:
            index=[1:10 14 15]; %the indexes of the data table used

            axes(out_text);
            columns=get(datatable,'ColumnName');
            for k=1:12
                text(k,20,['\bf',columns{index(k)}],...
                    'fontsize',8);
            end

            %colored rectangles:
            for k=1:site_num
                rectangle('Position',[0.25,19.75-k,0.5,0.5],'FaceColor',colors(k,:))            
            end

            %now the data
            data=get(datatable, 'Data');

            for s=1:site_num
                for c=1:12     
                   str=sprintf('%2.3f',(data(order(s),index(c))));
                   if strcmp(str,'NaN')
                       str='-';
                   end
                   text(c,20-s,str,...
                       'fontsize', 8); 
                end            
            end

            %now calibration
            line=18-site_num;
            if getappdata(0,'ft_fit')
                if getappdata(0,'ft_lor2');  
                    text(1,line,sprintf(...
                        'FT Fit, Lor2 src function, FWHM of src:  %2.3f', ...
                        getappdata(0,'fwhm_s')),...
                       'fontsize', 8);                
                else
                    text(1,line,sprintf('FT Fit, FWHM of src:  %2.3f', getappdata(0,'fwhm_s')),...
                       'fontsize', 8);
                end
                line=line-1;
            end
            if ~get(cal_cb,'value')
                if ~get(sin_cb,'value')
                   text(1,line,sprintf('Max Vel: %2.3f \t\t Std. CS: %2.3f \t \t linear velocity scale',...
                       str2double(get(maxv_txt,'String')), str2double(get(stdcs_txt,'String'))),...
                           'fontsize', 8);
                else
                   text(1,line,sprintf('Max Vel: %2.3f \t\t Std. CS: %2.3f \t\t sinusoidal velocity scale',...
                       str2double(get(maxv_txt,'String')), str2double(get(stdcs_txt,'String'))),...
                           'fontsize', 8);
                end
            end

            if FilterIndex==1
                print(out_fig,'-dpdf',[path, file])   
            else            	
                print(out_fig,'-depsc2',[path, file]) 
            end
            delete(out_fig);
            %open(file);
        end
    end

    function save_data_btn_click(~, ~)
        work_path=getappdata(0,'work_path');
        
        if length(work_path)==0
            work_path=pwd;
        end
        old_folder=cd(work_path);
        [file, path]=uiputfile('*.txt');
         file=[path,file];
       
        if ~strcmp(file,'')
            site=getappdata(0,'site_data');
            site_num=getappdata(0,'site_num');
            
            %saving data all into a table
            I0=getappdata(0,'I0');
            all(1:length(data.x))=I0;
            order=getappdata(0,'bkg_order');
            param=getappdata(0,'bkg_param');
            data=getappdata(0,'data');
          
            for k=2:order
                all=all-param(k)*data.x.^(k-1); 
            end
            bkg_data=all;
            table=[data.x' data.y' bkg_data'];
            for k=1:site_num
                y_site=site(k).calc(data.x);
                if ~getappdata(0,'ft_fit');
                    all=all-y_site;
                else
                    ft_factor=getappdata(0,'ft_factor');
                    y_site=y_site*ft_factor;
                end
                y_site2=I0-y_site;
                table=[table y_site2'];                
            end
            if getappdata(0,'ft_fit')
                table=[table getappdata(0,'ft_y')];
            else
                table=[table all'];
            end
            res=getappdata(0,'residual');
            table=[table res'];
            fid=fopen(file,'w+');
            dlmwrite(file,table,'delimiter',' ','precision','%3.5f',...
                'newline', 'unix');
            fclose(fid);
            cd(old_folder);   
        end        
    end

    function save_sites_btn_click(~, ~)
        work_path=getappdata(0,'work_path');
        
        if length(work_path)==0
            work_path=pwd;
        end
        old_folder=cd(work_path);
        [file,path,FilterIndex] = uiputfile({'*.ma';'*.txt'},...
            'Save fitted Site parameter');
        if path
            
            setappdata(0,'work_path', path);
            sites=getappdata(0,'site_data');
            %constraints
            con_matrix=getappdata(0,'con_matrix');
            con_num=getappdata(0,'con_num');
            %ft things
            ft_factor=getappdata(0,'ft_factor');
            ft_fit=getappdata(0,'ft_fit');
            fwhm_s=getappdata(0,'fwhm_s');
            ft_lor2=getappdata(0,'ft_lor2');
            I0=getappdata(0,'I0');
            %background
            bkg_order=get(polynom_type,'Value');
            bkg_param=getappdata(0,'bkg_param');
            
            if FilterIndex==1 
                disp(sites(1).cs)
                disp(sites(1).qs)
                save([path,file],'sites', 'con_matrix', 'con_num',...
                    'ft_factor', 'ft_fit','fwhm_s','ft_lor2',...
                    'I0','bkg_order','bkg_param');  
                
                
            elseif FilterIndex==2             
                output(1,:)= {'site', 'CS','error','FWHM', 'error',...
                    'intensity','error','QS','error', 'BHF', 'error',...
                    'type', 'n','error','a12', 'error', 'a13','error'};
                site=getappdata(0,'site_data');
                site_num=getappdata(0,'site_num');
               
                for k=1:site_num
                   output(k+1,:)={k, site(k).cs, site(k).cs_error,...
                       site(k).fwhm, site(k).fwhm_error,...
                       site(k).intensity, site(k).intensity_error,...
                       site(k).qs,site(k).qs_error,...
                       site(k).bhf,site(k).bhf_error,...
                       site(k).func_type, site(k).n, site(k).n_error,...
                       site(k).a12,site(k).a12_error,...
                       site(k).a13,site(k).a13_error};
                end   
                dlmcell([path,file],output,';'); 
            end           
        end   
        cd(old_folder);        
    end

    function load_sites_btn_click(~, ~)       
        work_path=getappdata(0,'work_path');
        if length(work_path)==0
            work_path=pwd;
        end
        old_folder=cd(work_path);
        
        [file,path] = uigetfile({'*.ma'},'Load Sites File');
        
        if path     
            
            %%delete handles of old sites:
            %*************************************************************
            site_num=getappdata(0,'site_num');
            sites=getappdata(0,'site_data');
            for k=1:site_num
                sites(k).delete_h();
            end
            
            
            setappdata(0,'work_path',path);
            sites_con=load([path,file], '-mat');
            
            %%save the ft settings:
            %*************************************************************
            setappdata(0,'ft_factor',sites_con.ft_factor);
            set(ft_factor_txt,'string',sites_con.ft_factor); 
            
            setappdata(0,'ft_fit',sites_con.ft_fit);
            set(ft_cb,'value',sites_con.ft_fit);
            
            setappdata(0,'fwhm_s',sites_con.fwhm_s);
            set(fwhm_s_txt,'string',sites_con.fwhm_s);
            
            setappdata(0,'ft_lor2',sites_con.ft_lor2);
            set(lor2_cb,'value',sites_con.ft_lor2); 
            
            %%save the background settings:
            %*************************************************************
            setappdata(0,'I0',sites_con.I0);
            setappdata(0,'bkg_order',sites_con.bkg_order);
            setappdata(0,'bkg_param',sites_con.bkg_param);
            set(polynom_type,'value',sites_con.bkg_order);
            
            %%saving sites
            %*************************************************************
            sites=sites_con.sites;                      
            
            site_num=length(sites);
            setappdata(0,'site_num', site_num);
            setappdata(0,'site_cur', 1);
            
            set(site_num_txt, 'String', 1);
            
            if site_num>=2
                set(site_num_cnt, 'Enable','on');
                set(site_num_cnt, 'Max', site_num);
                set(site_num_cnt, 'Min', 1);
                set(site_num_cnt, 'Value' , 1);
                set(site_num_cnt, 'SliderStep', [1/(site_num-1) 5]);
            else
                set(site_num_cnt, 'enable', 'off');
            end
            
            %%create the site handles:
            %*************************************************************
            data=getappdata(0,'data');
            axes(dataAxes);
            hold on;
            
            for k=1:site_num
                clear site_y;
                if sites_con.ft_fit
                    factor=sites_con.ft_factor;
                else
                    factor=1;
                end
                y=sites(k).calc(data.x).*factor;
                if k==1
                    sites(k).line_h=plot(dataAxes,data.x,y,'r-');
                else
                    sites(k).line_h=plot(dataAxes,data.x,y,'b-');
                end
            end
            
            setappdata(0,'site_data', sites);
            update_sum();
            hold off;
            update_scales();
               
            
            %saving constraints... 
            %*************************************************************
            con_matrix=sites_con.con_matrix;
            con_num=sites_con.con_num;
            
            setappdata(0,'con_matrix', con_matrix);
            setappdata(0,'con_num',con_num);
            
            if con_num>=1
                setappdata(0,'con_cur',1);                
                set(con_num_txt,'String', 1);
                
                for k=1:site_num
                    str{k}=int2str(k);
                end
                set(site1_number_pop, 'String', str);
                set(site2_number_pop, 'String', str);
                

                set(site1_number_pop,'value',con_matrix(1,1));
                set(site1_number_pop,'visible','on');
                set(site1_number_pop,'enable','on');
                
                str={'CS','FWHM','Int'};
                if strcmp(sites(con_matrix(1,1)).type,'Doublet')
                    str{4}='QS';
                elseif strcmp(sites(con_matrix(1,1)).type,'Sextet')
                    str{4}='BHF';
                end
                
                set(site1_var_pop,'String',str);  
                set(site1_var_pop,'value',con_matrix(1,2));
                set(site1_var_pop,'visible','on');
                set(site1_var_pop,'enable','on');
                
                set(site2_number_pop,'value',con_matrix(1,3));
                set(site2_number_pop,'visible','on');
                set(site2_number_pop,'enable','on');
                
                str={'CS','FWHM','Int'};
                if strcmp(sites(con_matrix(1,3)).type,'Doublet')
                    str{4}='QS';
                elseif strcmp(sites(con_matrix(1,3)).type,'Sextet')
                    str{4}='BHF';
                end
                set(site2_var_pop,'String',str);  
                set(site2_var_pop,'value',con_matrix(1,2));
                set(site2_var_pop,'visible','on');
                set(site2_var_pop,'enable','on');

                set(con_factor_txt,'String', num2str(con_matrix(1,5)));
                
                if con_num>=2
                    set(con_num_cnt, 'Enable','on');
                    set(con_num_cnt, 'Max', con_num);
                    set(con_num_cnt, 'Min', 1);
                    set(con_num_cnt, 'Value' , 1);
                    set(con_num_cnt, 'SliderStep', [1/(con_num-1) 5]);           
                end                    
            end      
            update_txt();
        end
        cd(old_folder);    
    end

    function fwhm_s_txt_cb(hObject,~)
        str=get(hObject,'string');
        str=strrep(str,',','.');
        var=str2double(str);
        if isnan(var)
            beep;
            set(hObject,'String', '');
        else
            set(hObject,'String',var);
            setappdata(0,'fwhm_s',var);
        end                     
    end

    function ft_factor_txt_cb(hObject, ~)
        str=get(hObject,'string');
        str=strrep(str,',','.');
        var=str2double(str);
        if isnan(var)
            beep;
            set(hObject,'String', '');
        else
            set(hObject,'String',var);
            setappdata(0,'ft_factor',var);
            sites=getappdata(0,'site_data');
            site_cur=getappdata(0,'site_cur');
            sites(site_cur).update_h();
        end                   
    end

    function lor2_cb_click(hObject,~)
       setappdata(0,'ft_lor2', get(hObject,'Value'));        
    end

    function src_calib_txt_cb(hObject, ~)
        str=get(hObject,'string');
        str=strrep(str,',','.');
        var=str2double(str);
        if isnan(var)
            beep;
            set(hObject,'String', '');
        else
            set(hObject,'String',var);
            setappdata(0,'src_calib_fwhm',var);
        end   
    end

    function src_calib_btn_click(~, ~)
        %getting zl_data
        data=getappdata(0,'data');
        
        options=optimset('OutputFcn', @outfun);
        
        %delete all site handles
        old_site=getappdata(0,'site_data');
        site_num=getappdata(0,'site_num');
        for k=1:site_num
            old_site(k).delete_h();
        end
        
        %ftting data to FT integral with Lorentzian model:
        %values for %bkg
        ival= [getappdata(0,'I0'),    0,   0];
        lb=   [-inf, -inf, -inf];
        ub=   [inf,  inf,   inf];
        
        
        %           src_fwhm    centralshift intensity
        ival=[ival, 0.4,    0,              8           ];
        lb=[lb,     0,      min(data.x),    0           ];
        ub=[ub,     Inf,    max(data.x),    Inf         ];
        [param,~,residual] = ...
               lsqcurvefit(@src_calib_model, ival, data.x, data.y, ...
               lb, ub,options);
           
        %just for fitting purposes a site is constructed        
        y(1:length(data.x))=NaN;
        hold on;
        line_h=plot(data.x,y,'r-');
        hold off;
        site=csite(0,0.19,3,line_h);
        site.cs=param(5);
        site.fwhm=getappdata(0,'src_calib_fwhm');
        site.intensity=param(6);
        site.func_type='Lorentzian';
        site.type='Singlet';
        
        setappdata(0,'site_data', site);
        setappdata(0,'site_num', 1);
        setappdata(0,'site_cur',1);
        
        set(site_num_txt, 'String', 1);
        set(site_num_cnt, 'Value', 1);
        set(site_num_cnt, 'Enable', 'Off');
        
        setappdata(0,'ft_fit', 1);
        setappdata(0,'ft_y', src_calib_model(param,data.x));        
        setappdata(0,'residual',residual);
        setappdata(0,'I0', param(1));
        set(ft_cb,'value',1);
        
        src_calib_fwhm=getappdata(0,'src_calib_fwhm');
     
        ft_factor=(max(data.y)-min(data.y))/max(lorentz_curve(param(5),src_calib_fwhm,param(6),data.x))*0.8;
        setappdata(0,'ft_factor',ft_factor);
        set(ft_factor_txt,'String',ft_factor);
        set(fwhm_s_txt,'string',param(4));
        setappdata(0,'fwhm_s',param(4));
        
        setappdata(0,'bkg_order', 3);
        setappdata(0,'bkg_param', param(1:3));
                
        set(getappdata(0,'res_h'),'ydata',residual);
        update_scales();
        update_sum();
        update_txt();      
        
    end

    function y=src_calib_model(x,xdata)
        x_dummy=-30:0.01:30;
        
        bkg=-xdata*x(2)-x(3)*xdata.^2;
        
        if getappdata(0, 'ft_lor2')
           y1=lorentz_squared(0,x(4),1,x_dummy); 
        else               
           y1=lorentz_curve(0,x(4),1,x_dummy); 
        end
        
        
        src_calib_fwhm=getappdata(0,'src_calib_fwhm') ;       
        y2=exp(-(lorentz_curve(x(5),src_calib_fwhm,x(6),x_dummy)));

        y_model=convn(y1,y2,'same');

        y_model=pchip(x_dummy, y_model,xdata);
        y_model=y_model./max(y_model);
        y=x(1)*y_model+bkg; 
    end
    
     function stop = outfun(~, optimValues,state)
        stop = false;
        switch state
        case 'init'

        case 'iter'
            str=cellstr(get(status_txt, 'String'));
            str=[str; cellstr(sprintf('       %d \t %2.4d', optimValues.iteration, optimValues.resnorm))];
            if length(str)>8
                new_str=str(2:9);
                str=new_str;
            end
            set(status_txt, 'String',str);
            drawnow;
        case 'done'
           str=cellstr(get(status_txt, 'String'));
           str=[str; cellstr('       End fitting')];
           if length(str)>8
                new_str=str(2:9);
                 str=new_str;
           end
           set(status_txt, 'String',str);
       otherwise
       end        
    end %outfun    
    
%**************************************************************************
%************************constraints stuff*********************************
%**************************************************************************
    
    %EXPLAINATION:
    
    %there are several variables controlling the behavior of the
    %constraints !con_num! saves the number of constraints, !con_cur! saves
    %the current selected constraint !con_matrix! saves the actual
    %constraint in a matrix form where:
    %[site1 param1 site2 param2 factor] each as number the params are
    %ordered as CS=1 QS=2 FWHM=3 QS=4 BHF=5 A12=6 A13=7
    %generel formula: site2.param2=factor*site1.param1.
    
    %the line of the matrix defines the number of the constraint
    %the information of the constraint is linked to the csite via the con
    %matrix in csite as follows the con matrix is initialized as a [0 0 0
    %0] matrix where each number represents a param as above.
    
    %the matrix will be changed when the specific site is constrained...
    %is the param is a param1 in the con_matrix the value will be negative 
    %and if the parami s a param2 con_matrix the value will be positiv. The
    %Value is always the number of the constraint (defined by the row in
    %the con_matrix).
    %cfit or cft_fit splits these values and 
    
    function add_con_btn_click(~, ~)
        con_num=getappdata(0,'con_num');
        if con_num>0
            setappdata(0,'con_cur',con_num);
            save_con_btn_click([],[])
        end
        con_num=con_num+1;
        setappdata(0,'con_num',con_num);
        setappdata(0,'con_cur',con_num);

        %define the slider things
        set(con_num_txt, 'String', con_num);
        if con_num>=2
            set(con_num_cnt, 'Enable','on');
            set(con_num_cnt, 'Max', con_num);
            set(con_num_cnt, 'Min', 1);
            set(con_num_cnt, 'Value' , con_num);
            set(con_num_cnt, 'SliderStep', [1/(con_num-1) 5]);           
        end     
        
        %define the stuff to choose:
        site_num=getappdata(0,'site_num');
        for k=1:site_num
            str{k}=int2str(k);
        end
        set(site1_number_pop, 'String', str);
        set(site2_number_pop, 'String', str);
        
        set(site1_var_pop, 'String', ' ');
        set(site2_var_pop, 'String', ' ');
    end

    function save_con_btn_click(~, ~)
        con_cur=getappdata(0,'con_cur');
        con_num=getappdata(0,'con_num');

        site=getappdata(0,'site_data');
        %erase the old values if there are any:
        
        con_matrix=getappdata(0,'con_matrix');
        
        if size(con_matrix,2)==con_num
            if sum(con_matrix(con_cur,:))>0
                site1=con_matrix(con_cur,1);
                site2=con_matrix(con_cur,3);

                param1=con_matrix(con_cur,2);
                param2=con_matrix(con_cur,4);

                site(site1).con(param1)=0;
                site(site2).con(param2)=0;    
            end
        end
        
        
        %save the new values
        site1=get(site1_number_pop,'value');
        site2=get(site2_number_pop,'value');
        
        param1=get(site1_var_pop,'value');
        param2=get(site2_var_pop,'value');
        
        site(site1).con(param1)=-con_cur;
        site(site2).con(param2)=con_cur;
              
        con_factor=str2double(get(con_factor_txt,'String'));
        
        %saving in matrix form:
        con_matrix(con_cur,:)=[site1 param1 site2 param2 con_factor];
        setappdata(0,'con_matrix',con_matrix);
        
        setappdata(0,'site_data', site);
    end
    
    function con_num_cnt_click(hObject, ~)
        con_cur=get(hObject, 'Value');
        set(con_num_txt,'String', con_cur);
        setappdata(0,'con_cur', con_cur);
        con_matrix=getappdata(0,'con_matrix');
        
        set(site1_number_pop,'value',con_matrix(con_cur,1));
        set(site1_var_pop,'value',con_matrix(con_cur,2));
        
        set(site2_number_pop,'value',con_matrix(con_cur,3));
        set(site2_var_pop,'value',con_matrix(con_cur,4));
        
        set(con_factor_txt,'String', num2str(con_matrix(con_cur,5)));
    end

    function del_con_btn_click(~, ~)
        con_cur=getappdata(0,'con_cur');
        con_matrix_old=getappdata(0,'con_matrix');
        con_num=getappdata(0,'con_num');
        site=getappdata(0,'site_data');
        site_num=getappdata(0,'site_num');
        
        %update the con_matrix
        counter=0;
        if con_num>1
            for k=1:con_num
                if k~=con_cur
                    counter=counter+1;
                    con_matrix_new(counter,:)=con_matrix_old(k,:);
                end
            end
            setappdata(0,'con_matrix', con_matrix_new);
            con_matrix=con_matrix_new;
            con_num=con_num-1;
        else
            con_num=0;
        end
        
        if con_cur>con_num
            con_cur=con_num;
        end
        
        setappdata(0,'con_num', con_num);
        
        %now update the all the sites!
        %first setting the constraints everywhere to 0
        
        for k=1:site_num
           site(k).con=[0;0;0;0;0;0;0];
        end
        
        if con_num>=1
            % now look for the matrix and set the values:
            for n=1:con_num
              site(con_matrix(n,1)).con(con_matrix(n,1))=-n;
              site(con_matrix(n,3)).con(con_matrix(n,4))=n;
            end 
            %popup mist:

            %define the stuff to choose for the sites
            site_num=getappdata(0,'site_num');
            for k=1:site_num
                str{k}=int2str(k);
            end
            set(site1_number_pop, 'String', str);
            set(site2_number_pop, 'String', str);

            %set the right numbers
            set(site1_number_pop, 'value', con_matrix(con_cur,1));
            set(site2_number_pop, 'value', con_matrix(con_cur,3));

            %define the stuff to choose for the params
            %param 1:
            str={'CS','FWHM','Int'};
            if strcmp(site(con_matrix(con_cur,1)).type,'Doublet')
                str{4}='QS';
            elseif strcmp(site(con_matrix(con_cur,1)).type,'Sextet')
                str{4}='BHF';
            end
            set(site1_var_pop,'String',str); 
            set(site1_var_pop,'value', con_matrix(con_cur,2));

            %param 2:
            str={'CS','FWHM','Int'};
            if strcmp(site(con_matrix(con_cur,3)).type,'Doublet')
                str{4}='QS';
            elseif strcmp(site(con_matrix(con_cur,3)).type,'Sextet')
                str{4}='BHF';
            end
            set(site2_var_pop,'String',str); 
            set(site2_var_pop,'value', con_matrix(con_cur,4));
            
            set(con_factor_txt, 'String', con_matrix(con_cur,5));
            
        else
            set(site1_number_pop, 'String', {' '});
            set(site1_number_pop, 'Value', 1);
            set(site2_number_pop, 'String', {' '});
            set(site2_number_pop, 'Value', 1);

            set(site1_var_pop, 'String', {' '});
            set(site1_var_pop, 'Value', 1);
            set(site2_var_pop, 'String', {' '});
            set(site2_var_pop, 'Value', 1);
            
            set(con_factor_txt, 'String', 1);
        end
        
        setappdata(0,'site_data',site);
        
        %
        set(con_num_txt,'String',con_cur);        
         %slider mist:
        if con_num>=1
            if con_num>1
                set(con_num_cnt, 'enable','on');
            else
                disp('test');                
                %next values are just for supressing the errors when the
                %value is below Minimum or not in the range of the counter
                set(con_num_cnt, 'Min', 1);
                set(con_num_cnt, 'Max', 10);
                set(con_num_cnt, 'value',1);
                set(con_num_cnt, 'enable', 'inactive');
            end
                
            if con_num>=2
              set(con_num_cnt, 'SliderStep', [1/(site_num-1) 5]); 
              set(con_num_cnt, 'Max', con_num);
              set(con_num_cnt,'value',con_cur);
            end            
        else
            set(con_num_cnt, 'Enable', 'inactive');
            %next values are just for supressing the errors when the
            %value is below Minimum or not in the range of the counter
            set(con_num_cnt, 'Min', 1);
            set(con_num_cnt, 'Max', 10);
            set(con_num_cnt, 'value',1);
            set(con_num_txt, 'String', 0);
        end           
    end
    
    
    function site1_number_pop_cb(hObject, ~)
        site1_num=get(hObject, 'value');
        site=getappdata(0,'site_data');
        str={'CS','FWHM','Int'};
        if strcmp(site(site1_num).type,'Doublet')
            str{4}='QS';
            str{5}='A12';
        elseif strcmp(site(site1_num).type,'Sextet')
            str{4}='QS';
            str{5}='A12';
            str{6}='BHF';
            str{7}='A13';            
        end
        set(site1_var_pop,'String',str);    
    end

    function site2_number_pop_cb(hObject, ~)
        site2_num=get(hObject, 'value');
        site=getappdata(0,'site_data');
        str={'CS','FWHM','Int'};
        if strcmp(site(site2_num).type,'Doublet')
            str{4}='QS';
            str{5}='A12';
        elseif strcmp(site(site2_num).type,'Sextet')
            str{4}='QS';
            str{5}='A12';
            str{6}='BHF';
            str{7}='A13'; 
        end
        set(site2_var_pop,'String',str);          
    end

    function con_factor_txt_cb(hObject, ~)
        str=get(hObject,'string');
        str=strrep(str,',','.');
        var=str2double(str);
        if isnan(var)
            beep;
            set(hObject,'String', '');
        else
            set(hObject,'String',var);
        end                   
    end
    


%*********************  Callbacks for MYGUI****************************
%**********************************************************************
    function fh_ResizeFcn(~, ~)
        panel_width=getappdata(0,'panel_width');
        fig_pos=get(fh,'Position');
        width=fig_pos(3);
        height=fig_pos(4);
        if height<=600
            height=600;
            fig_pos(4)=600;
            set(fh,'position', fig_pos);
            movegui(fh,'onscreen');
        end
        
        resize_graphs;
        set(lpanh,'Position', [0 0.2*height panel_width 0.8*height]);
        set(cpanh,'Position', [panel_width 0.2*height width-2*panel_width 0.8*height]);
        set(rpanh,'Position', [width-panel_width 0.2*height panel_width 0.8*height]);
        set(bpanh,'Position', [0 20 width (0.2*height-20)]);
        set(footer,'Position', [0 0 width 20]);
        
        
        %repositioning 
        
        %place the copy bla in the right lower corner
        set(reference_lbl,'Position', [width/2 0 width/2-10 15]);
        
        %resize the datatable
        set(datatable,'Position', [0 0 width (0.2*height-20)]);
        
        
        old_height=0.8*getappdata(0,'old_height');
        new_height=0.8*height;
        
        resize_pans(old_height, new_height);
        
        setappdata(0,'old_height', height);
    end
 
    function resize_pans(old_height, new_height)
        resize_pan(lpanh,new_height, old_height);
        resize_pan(tab1,new_height, old_height);
        resize_pan(tab2,new_height, old_height);
        resize_pan(tab3_c.panH,new_height, old_height);
        resize_pan(tab5_content.panH,new_height, old_height);        
    end

    function resize_pan(pan, new_height, old_height)
        pan_child=allchild(pan);
        for n=1:length(pan_child);
           pos=get(pan_child(n),'position');
           pos(2)=new_height-(old_height-pos(2));
           set(pan_child(n),'position',pos);
        end   
    end

    function resize_graphs()
        panel_width=getappdata(0,'panel_width');
        fig_pos=get(fh,'position');
        f_width=fig_pos(3);
        f_height=fig_pos(4);
        set(dataAxes,'OuterPosition',[0 0.2*0.8*f_height f_width-2*panel_width 0.8*0.8*f_height]);
        set(dataAxes,'Position', get(dataAxes, 'OuterPosition') - ...
           get(dataAxes, 'TightInset') * [-1 0 1 0; 0 -1 0 1; 0 0 1 0; 0 0 0 1]+[10 10 -20 -20]);
        pos1=get(dataAxes,'Position');
        set(resAxes,'Position',[pos1(1) 0.05*f_height*0.8 pos1(3) 0.15*0.8*f_height]);
    end
        
    function fh_WindowButtonMotionFcn(~, ~)  
        
        %listener for the main graph window:
        %*********************************************
        pos=get(dataAxes,'currentpoint');
        XLim=get(dataAxes,'XLim');
        YLim=get(dataAxes,'YLim');
        if pos(1,1)>=XLim(1) && pos(1,1)<=XLim(2) && ...
                pos(1,2)>=YLim(1) && pos(1,2)<=YLim(2)
            str=sprintf('x: %2.2f \t\t y: %2.2f',pos(1,1),pos(1,2));
            set(output_lbl,'string', str);
         
            fitting=getappdata(0,'fitting_data');
            state=fitting.state;
            I0=getappdata(0,'I0');
            
            
            %first state of defining a site by just giving the position of
            %the first peak (for Doublets and Sextets) or define the
            %position of the singlet
            
            if strcmp(state, 'define1')
                x(1)=pos(1,1);    x(2)=x(1);
                y(1)=I0;          y(2)=pos(1,2);
                %save in appdata
                site=getappdata(0,'site_data');
                site_num=getappdata(0,'site_num');
                site(site_num).cs=x(1);
                
                %convert the heigt of the mouse into intensity (conversion
                %is for every type of function different) (see wikipedia:))
                if strcmp(site(site_num).func_type, 'Lorentzian')
                    site(site_num).intensity=(I0-y(2))*(pi*site(site_num).hwhm);
                elseif strcmp(site(site_num).func_type, 'Gaussian');
                    site(site_num).intensity=(I0-y(2))*(sqrt(pi)*site(site_num).hwhm/0.8326);
                elseif strcmp(site(site_num).func_type, 'PseudoVoigt')
                    site(site_num).intensity=(I0-y(2))*...
                        site(site_num).n*(pi*site(site_num).hwhm)+...
                        (1-site(site_num).n)*(I0-y(2))*(sqrt(pi)*site(site_num).hwhm/0.8326);      
                elseif strcmp(site(site_num).func_type, 'LorSquared')
                    site(site_num).intensity=(I0-y(2))*pi/2*site(site_num).hwhm;    
                end
                
                ft_fit=getappdata(0,'ft_fit');
                
                %if we use fulltransmission integral, there is a need of
                %multiplying the intensity of the individual sites in order
                %to see them...
                if ft_fit
                    site(site_num).intensity=site(site_num).intensity/...
                        getappdata(0,'ft_factor');
                end
                
                site(site_num).height=(I0-y(2));
                setappdata(0,'site_data', site);

                %update text boxes:
                update_txt();
                
                %update graphs
                line_ver_h=getappdata(0,'line_ver_h');
                set(line_ver_h,'xdata',x);
                set(line_ver_h,'ydata',y);
                site(site_num).update_h();
                update_sum();                
              
            elseif strcmp(state, 'define2')
                %second state of defining the site:
                %here FWHM is defined by moving with the mouse
               site=getappdata(0,'site_data');
               site_cur=getappdata(0,'site_cur');
               site_num=getappdata(0,'site_num');

               %define the positions of the line
               x(1)=pos(1,1);
               hwhm=(x(1)-site(site_cur).cs);

               site(site_num).fwhm=abs(hwhm)*2;
               
               %again convert height and FWHM into intensity (they are
               %related)
               
               if strcmp(site(site_num).func_type, 'Lorentzian')
                 site(site_num).intensity=abs(hwhm)*pi*site(site_num).height;
               elseif strcmp(site(site_num).func_type, 'Gaussian')
                   site(site_num).intensity=site(site_num).height*(sqrt(pi)*site(site_num).hwhm/0.8326);
               elseif strcmp(site(site_num).func_type, 'PseudoVoigt')
                   site(site_num).intensity=site(site_num).height*...
                      site(site_num).n*(pi*site(site_num).hwhm)+...
                     (1-site(site_num).n)*site(site_num).height*(sqrt(pi)*site(site_num).hwhm/0.8326);   
               elseif strcmp(site(site_num).func_type, 'LorSquared')
                   site(site_num).intensity=pi/2*site(site_num).hwhm*site(site_num).height;
               elseif strcmp(site(site_num).func_type, 'LorSquared')
                   site(site_num).intensity=site(site_num).height*(2*pi*site(site_num).hwhm+pi*site(site_num).hwhm);
               end
               ft_fit=getappdata(0,'ft_fit');
               if ft_fit
                    site(site_num).intensity=site(site_num).intensity/...
                        getappdata(0,'ft_factor');
                end
               x(2)=x(1)-2*hwhm;
               y(1)=I0-0.5*site(site_cur).height;
               y(2)=y(1);
               
               %save site parameter:
               setappdata(0,'site_data', site);
               
               %plot data, vline, new hline
               
               line_hor_h=getappdata(0,'line_hor_h');
               set(line_hor_h,'xdata',x);
               set(line_hor_h,'ydata',y);
               data=getappdata(0,'data');
               site(site_num).update_h();
               update_sum();
               
               
               %updating the fwhm_txt toolbox
               update_txt();
            elseif strcmp(state,'define3')
                %third stage defines the QS or BHF values
                
                site=getappdata(0,'site_data');
                site_num=getappdata(0,'site_num');
                %define the positions of the second peak
                x2=pos(1,1);

                if strcmp(site(site_num).type,'Doublet')
                   site(site_num).qs=x2-site(site_num).cs1;
                   if x2>site(site_num).cs1
                      site(site_num).cs=site(site_num).cs1+site(site_num).qs/2;
                   else
                      site(site_num).cs=site(site_num).cs1-site(site_num).qs/2;
                   end
                end
                if strcmp(site(site_num).type,'Sextet')
                   site(site_num).bhf=abs((x2-site(site_num).cs1)*3.097);
                   if x2>site(site_num).cs1
                      site(site_num).cs=site(site_num).cs1+site(site_num).bhf_s/2;
                   else
                      site(site_num).cs=site(site_num).cs1-site(site_num).bhf_s/2;
                   end
                end

                setappdata(0,'site_data', site);

                %plot shit:
                data=getappdata(0,'data');
                x(1)=pos(1,1);    x(2)=x(1);
                y(1)=I0;          y(2)=I0-site(site_num).height;
                
                line_hor_h=getappdata(0,'line_hor_h');
                set(line_hor_h,'xdata',x);
                set(line_hor_h,'ydata',y);
                site(site_num).update_h();
                update_sum();
                update_txt();                
            end
        else
            set(output_lbl,'string','');
        end
        
        
        %******************************************************************
        %**********************listener for xVBF window********************
        %******************************************************************
        
        pos=get(tab3_c.qsd_axes,'currentpoint');
        XLim=get(tab3_c.qsd_axes,'XLim');
        YLim=get(tab3_c.qsd_axes,'YLim');
        if pos(1,1)>=XLim(1) && pos(1,1)<=XLim(2) && ...
                pos(1,2)>=YLim(1) && pos(1,2)<=YLim(2)
         
            fitting=getappdata(0,'fitting_data');
            state=fitting.state;
            
            %first state of defining a site by just giving the position of
            %the peak 
            
            if strcmp(state, 'define_qsd1')
                x(1)=pos(1,1);    x(2)=x(1);
                y(1)=0;          y(2)=pos(1,2);
                %save in appdata
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');    
                
                qsd_num=site(site_cur).qsd_site_num;
                
                site(site_cur).qsd_site(qsd_num).qs=x(1);                                
                site(site_cur).qsd_site(qsd_num).p_i=...
                    (y(2))*(sqrt(pi)*site(site_cur).qsd_site(qsd_num).fwhm/(2*0.8326));
                site(site_cur).qsd_site(qsd_num).height=(y(2));
                
                
                site(site_cur)=site(site_cur).recalculate_pi();
                site(site_cur).update_h();
                setappdata(0,'fitting_data', fitting);
                setappdata(0,'site_data',site); 
                
                %update graphs
                y(2)=site(site_cur).qsd_site(qsd_num).p_i./...
                       (sqrt(pi)*site(site_cur).qsd_site(qsd_num).fwhm/(2*0.8326));
                qsd_ver_h=getappdata(0,'qsd_ver_h');
                set(qsd_ver_h,'xdata',x);
                set(qsd_ver_h,'ydata',y);
                
                ymax=0;
                for l=1:site(site_cur).qsd_site_num
                   ymax=max([ymax;site(site_cur).qsd_site(l).p_i./...
                       (sqrt(pi)*site(site_cur).qsd_site(l).fwhm/(2*0.8326))]); 
                end
                set(tab3_c.qsd_axes,'ylim',[0; ymax*1.2]);
                tab3_c.update_txt();
              
            elseif strcmp(state, 'define_qsd2')
                %second state of defining the site:
                %here FWHM is defined by moving with the mouse
               site=getappdata(0,'site_data');
               site_cur=getappdata(0,'site_cur');
               qsd_num=site(site_cur).qsd_site_num;

               %define the positions of the line
               x(1)=pos(1,1);
               hwhm=abs(x(1)-site(site_cur).qsd_site(qsd_num).qs);

               site(site_cur).qsd_site(qsd_num).fwhm=abs(hwhm)*2;
               site(site_cur).qsd_site(qsd_num).p_i=...
                   site(site_cur).qsd_site(qsd_num).height*(sqrt(pi)*hwhm/0.8326);
               
               
%                site(site_cur).qsd_site(qsd_num).update_h();

               site(site_cur)=site(site_cur).recalculate_pi();
               site(site_cur).update_h();
               setappdata(0,'fitting_data', fitting);
               setappdata(0,'site_data',site);    
               
               
               tab3_c.update_txt();
               
               x(1)=site(site_cur).qsd_site(qsd_num).qs+hwhm;
               x(2)=site(site_cur).qsd_site(qsd_num).qs-hwhm;
               y(1)=0.5*site(site_cur).qsd_site(qsd_num).p_i./...
                       (sqrt(pi)*site(site_cur).qsd_site(qsd_num).fwhm/(2*0.8326));
               y(2)=y(1);
               
               qsd_hor_h=getappdata(0,'qsd_hor_h');
               set(qsd_hor_h,'xdata',x);
               set(qsd_hor_h,'ydata',y);
               
                x(1)=site(site_cur).qsd_site(qsd_num).qs;    x(2)=x(1);
                y(1)=0;          y(2)=site(site_cur).qsd_site(qsd_num).p_i./...
                       (sqrt(pi)*site(site_cur).qsd_site(qsd_num).fwhm/(2*0.8326));
               
               qsd_ver_h=getappdata(0,'qsd_ver_h');
               set(qsd_ver_h,'xdata',x);
               set(qsd_ver_h,'ydata',y);
               
               ymax=0;
               for l=1:site(site_cur).qsd_site_num
                  ymax=max([ymax;site(site_cur).qsd_site(l).p_i./...
                      (sqrt(pi)*site(site_cur).qsd_site(l).fwhm/(2*0.8326))]); 
               end
               set(tab3_c.qsd_axes,'ylim',[0; ymax*1.2]);
            end
        end     
        
        pos=get(tab3_c.csd_axes,'currentpoint');
        XLim=get(tab3_c.csd_axes,'XLim');
        YLim=get(tab3_c.csd_axes,'YLim');
        if pos(1,1)>=XLim(1) && pos(1,1)<=XLim(2) && ...
                pos(1,2)>=YLim(1) && pos(1,2)<=YLim(2)
         
            fitting=getappdata(0,'fitting_data');
            state=fitting.state;
            
            %first state of defining a site by just giving the position of
            %the peak 
            
            if strcmp(state, 'define_csd1')
                x(1)=pos(1,1);    x(2)=x(1);
                y(1)=0;          y(2)=pos(1,2);
                %save in appdata
                site=getappdata(0,'site_data');
                site_cur=getappdata(0,'site_cur');    
                
                csd_num=site(site_cur).csd_site_num;
                
                site(site_cur).csd_site(csd_num).cs=x(1);                                
                site(site_cur).csd_site(csd_num).p_i=...
                    (y(2))*(sqrt(pi)*site(site_cur).csd_site(csd_num).fwhm/(2*0.8326));
                site(site_cur).csd_site(csd_num).height=(y(2));
                                
                
                site(site_cur)=site(site_cur).recalculate_pi();
                site(site_cur).update_h();
                setappdata(0,'fitting_data', fitting);
                setappdata(0,'site_data',site); 
                
                %update graphs
                y(2)=site(site_cur).csd_site(csd_num).p_i./...
                       (sqrt(pi)*site(site_cur).csd_site(csd_num).fwhm/(2*0.8326));
                csd_ver_h=getappdata(0,'csd_ver_h');
                set(csd_ver_h,'xdata',x);
                set(csd_ver_h,'ydata',y);
                
                ymax=0;
                for l=1:site(site_cur).csd_site_num
                   ymax=max([ymax;site(site_cur).csd_site(l).p_i./...
                       (sqrt(pi)*site(site_cur).csd_site(l).fwhm/(2*0.8326))]); 
                end
                set(tab3_c.csd_axes,'ylim',[0; ymax*1.2]);
                
                tab3_c.update_txt();
              
            elseif strcmp(state, 'define_csd2')
                %second state of defining the site:
                %here FWHM is defined by moving with the mouse
               site=getappdata(0,'site_data');
               site_cur=getappdata(0,'site_cur');
               csd_num=site(site_cur).csd_site_num;

               %define the positions of the line
               x(1)=pos(1,1);
               hwhm=abs(x(1)-site(site_cur).csd_site(csd_num).cs);

               site(site_cur).csd_site(csd_num).fwhm=abs(hwhm)*2;
               site(site_cur).csd_site(csd_num).p_i=...
               site(site_cur).csd_site(csd_num).height*(sqrt(pi)*hwhm/0.8326);
               

               site(site_cur)=site(site_cur).recalculate_pi();
               site(site_cur).update_h();
               setappdata(0,'fitting_data', fitting);
               setappdata(0,'site_data',site);    
               
               
               tab3_c.update_txt();
               
               x(1)=site(site_cur).csd_site(csd_num).cs+hwhm;
               x(2)=site(site_cur).csd_site(csd_num).cs-hwhm;
               y(1)=0.5*site(site_cur).csd_site(csd_num).p_i./...
                       (sqrt(pi)*site(site_cur).csd_site(csd_num).fwhm/(2*0.8326));
               y(2)=y(1);
               
               csd_hor_h=getappdata(0,'csd_hor_h');
               set(csd_hor_h,'xdata',x);
               set(csd_hor_h,'ydata',y);
               
                x(1)=site(site_cur).csd_site(csd_num).cs;    x(2)=x(1);
                y(1)=0;          y(2)=site(site_cur).csd_site(csd_num).p_i./...
                       (sqrt(pi)*site(site_cur).csd_site(csd_num).fwhm/(2*0.8326));
               
               csd_ver_h=getappdata(0,'csd_ver_h');
               set(csd_ver_h,'xdata',x);
               set(csd_ver_h,'ydata',y);
               
               ymax=0;
               for l=1:site(site_cur).csd_site_num
                  ymax=max([ymax;site(site_cur).csd_site(l).p_i./...
                      (sqrt(pi)*site(site_cur).csd_site(l).fwhm/(2*0.8326))]); 
               end
               set(tab3_c.csd_axes,'ylim',[0; ymax*1.2]);
            end
        end     
        
    end

    function fh_WindowButtonDownFcn(~, ~)
        
        pos=get(dataAxes,'currentpoint');
        XLim=get(dataAxes,'XLim');
        YLim=get(dataAxes,'YLim');
        if pos(1,1)>=XLim(1) && pos(1,1)<=XLim(2) && ...
                pos(1,2)>=YLim(1) && pos(1,2)<=YLim(2)  
            fitting=getappdata(0,'fitting_data');
            state=fitting.state;
            if strcmp(state,'define1')
               fitting.state='define2';
               setappdata(0,'fitting_data', fitting);
            end
            %%second click in peak defining procedure
            if strcmp(state,'define2')
               site=getappdata(0,'site_data');
               site_cur=getappdata(0,'site_cur');
               site_num=getappdata(0,'site_num');
               if strcmp(site(site_cur).type,'Singlet')
                   fitting.state='normal';
                   line_hor_h=getappdata(0,'line_hor_h');
                   line_ver_h=getappdata(0,'line_ver_h');
                   delete(line_hor_h);
                   delete(line_ver_h);                   
               else
                   if strcmp(site(site_cur).type,'Doublet')
                      site(site_cur).intensity=2*site(site_cur).intensity;            
                   elseif strcmp(site(site_cur).type, 'Sextet')
                      site(site_cur).intensity=4*site(site_cur).intensity; 
                   end
                   site(site_num).cs1=site(site_num).cs;
                   fitting.state='define3';
               end
               setappdata(0,'fitting_data', fitting);
               setappdata(0,'site_data', site);
               data=getappdata(0,'data');
            end
            if strcmp(state,'define3')
               fitting.state='normal';
               setappdata(0,'fitting_data', fitting);
               data=getappdata(0,'data');
               line_hor_h=getappdata(0,'line_hor_h');
               line_ver_h=getappdata(0,'line_ver_h');
               delete(line_hor_h);
               delete(line_ver_h);
            end
        end   
        
        
        pos=get(tab3_c.qsd_axes,'currentpoint');
        XLim=get(tab3_c.qsd_axes,'XLim');
        YLim=get(tab3_c.qsd_axes,'YLim');
        if pos(1,1)>=XLim(1) && pos(1,1)<=XLim(2) && ...
                pos(1,2)>=YLim(1) && pos(1,2)<=YLim(2)  
            fitting=getappdata(0,'fitting_data');
            state=fitting.state;
            if strcmp(state,'define_qsd1')
               fitting.state='define_qsd2';
               setappdata(0,'fitting_data', fitting);
            end
            %%second click in peak defining procedure
            if strcmp(state,'define_qsd2')
                
               fitting.state='normal';               
               qsd_hor_h=getappdata(0,'qsd_hor_h');
               qsd_ver_h=getappdata(0,'qsd_ver_h');
               delete(qsd_hor_h);
               delete(qsd_ver_h);                           
               site=getappdata(0,'site_data');
               site_cur=getappdata(0,'site_cur');
               
               site(site_cur)=site(site_cur).recalculate_pi();
               site(site_cur).update_h();
               setappdata(0,'fitting_data', fitting);
               setappdata(0,'site_data',site);      
               tab3_c.delete_graph_handles();
               tab3_c.create_graph_handles();
               tab3_c.update_graph_colors();
               tab3_c.update_graph();
               tab3_c.update_txt();
            end
        end
        
        pos=get(tab3_c.csd_axes,'currentpoint');
        XLim=get(tab3_c.csd_axes,'XLim');
        YLim=get(tab3_c.csd_axes,'YLim');
        if pos(1,1)>=XLim(1) && pos(1,1)<=XLim(2) && ...
                pos(1,2)>=YLim(1) && pos(1,2)<=YLim(2)  
            fitting=getappdata(0,'fitting_data');
            state=fitting.state;
            if strcmp(state,'define_csd1')
               fitting.state='define_csd2';
               setappdata(0,'fitting_data', fitting);
            end
            %%second click in peak defining procedure
            if strcmp(state,'define_csd2')
                
               fitting.state='normal';               
               csd_hor_h=getappdata(0,'csd_hor_h');
               csd_ver_h=getappdata(0,'csd_ver_h');
               delete(csd_hor_h);
               delete(csd_ver_h);                           
               site=getappdata(0,'site_data');
               site_cur=getappdata(0,'site_cur');
               
               site(site_cur)=site(site_cur).recalculate_pi();
               site(site_cur).update_h();
               setappdata(0,'fitting_data', fitting);
               setappdata(0,'site_data',site);      
               tab3_c.delete_graph_handles();
               tab3_c.create_graph_handles();
               tab3_c.update_graph_colors();
               tab3_c.update_graph();
               tab3_c.update_txt();
            end
        end
    end

    function fh_KeyPressFcn(~,evnt)
       if length(evnt.Modifier) == 1 & strcmp(evnt.Modifier{:},'control') & ...
			 evnt.Key == 'a'
         site=getappdata(0,'site_data');
         for k=1:length(site)
            site(k).fit=[true;true;true;true;true];
         end
         setappdata(0,'site_data',site);
         update_txt();
       elseif length(evnt.Modifier) == 1 & strcmp(evnt.Modifier{:},'control') & ...
			 evnt.Key == 'f'
         site=getappdata(0,'site_data');
         for k=1:length(site)
            site(k).fit=[false;true;true;false;false];
         end
         setappdata(0,'site_data',site);
         update_txt();  
       end
    end

    function update_sum()
       sum_h=getappdata(0,'sum_h');
       bkg_h=getappdata(0,'bkg_h');
       data=getappdata(0,'data');
       
       order=getappdata(0,'bkg_order');
       param=getappdata(0,'bkg_param');
       
       I0=getappdata(0,'I0');
       
       if ~getappdata(0,'ft_fit')           
           site=getappdata(0,'site_data');
           site_num=getappdata(0,'site_num');           
           y=ones(1,length(data.x))*I0;
           for k=2:order
               y=y-param(k)*data.x.^(k-1);
           end
           set(bkg_h,'ydata',y);
           
           for k=1:site_num
              y=y-site(k).calc(data.x);           
           end
           set(sum_h,'ydata',y);
       else
           set(sum_h,'ydata',getappdata(0,'ft_y'));
           y=ones(1,length(data.x))*I0;
           for k=2:order
               y=y-param(k)*data.x.^(k-1);
           end
           set(bkg_h,'ydata',y);
       end
    end
        
    function update_txt()  
        site=getappdata(0,'site_data');
        site_cur=getappdata(0,'site_cur');
             
        set(cs_txt, 'String', site(site_cur).cs);     
        set(cs_min_txt,'string', site(site_cur).cs_min);
        set(cs_max_txt,'string', site(site_cur).cs_max);
        
        set(fwhm_txt, 'String', site(site_cur).fwhm); 
        set(fwhm_min_txt,'string', site(site_cur).fwhm_min);
        set(fwhm_max_txt,'string', site(site_cur).fwhm_max);
        
        set(intensity_txt, 'String', site(site_cur).intensity);
        set(intensity_min_txt,'string', site(site_cur).intensity_min);
        set(intensity_max_txt,'string', site(site_cur).intensity_max);
        
        
        %now the checkboxxes
        
        set(cs_cb, 'Value', site(site_cur).fit(1));    
        if site(site_cur).fit(1)
           set(cs_min_txt,'Enable','on');
           set(cs_max_txt,'Enable','on');
        else
           set(cs_min_txt,'Enable','off');
           set(cs_max_txt,'Enable','off');
        end
        set(fwhm_cb, 'Value', site(site_cur).fit(2));
        if site(site_cur).fit(2)
           set(fwhm_min_txt,'Enable','on');
           set(fwhm_max_txt,'Enable','on');
        else
           set(fwhm_min_txt,'Enable','off');
           set(fwhm_max_txt,'Enable','off');
        end
        
        set(intensity_cb, 'Value', site(site_cur).fit(3));
        if site(site_cur).fit(3)
           set(intensity_min_txt,'Enable','on');
           set(intensity_max_txt,'Enable','on');
        else
           set(intensity_min_txt,'Enable','off');
           set(intensity_max_txt,'Enable','off');
        end

        %qs und blub
        if strcmp(site(site_cur).type, 'Singlet')
          set(qs_txt, 'Enable', 'Off');
          set(qs_txt, 'String', '');          
          set(qs_min_txt, 'Enable', 'Off');
          set(qs_max_txt, 'Enable', 'Off');
          set(qs_min_txt, 'String', '');
          set(qs_max_txt, 'String', '');
          set(qs_cb, 'Enable', 'Off');
          set(qs_cb, 'Value', 0);

          set(bhf_txt, 'Enable', 'Off');
          set(bhf_txt, 'String', '');    
          set(bhf_min_txt, 'Enable', 'Off');
          set(bhf_max_txt, 'Enable', 'Off');
          set(bhf_min_txt, 'String', '');
          set(bhf_max_txt, 'String', '');
          set(bhf_cb, 'Enable', 'Off');
          set(bhf_cb, 'Value', 0);
          
          set(A12_txt, 'Enable', 'Off');
          set(A12_txt, 'String', '');          
          set(A12_min_txt, 'Enable', 'Off');
          set(A12_max_txt, 'Enable', 'Off');
          set(A12_min_txt, 'String', '');
          set(A12_max_txt, 'String', '');
          set(A12_cb, 'Enable', 'Off');
          set(A12_cb, 'Value', 0);
          
          set(A13_txt, 'Enable', 'Off');
          set(A13_txt, 'String', '');    
          set(A13_min_txt, 'Enable', 'Off');
          set(A13_max_txt, 'Enable', 'Off');
          set(A13_min_txt, 'String', '');
          set(A13_max_txt, 'String', '');
          set(A13_cb, 'Enable', 'Off');
          set(A13_cb, 'Value', 0);
          
          set(tab3_c.convert_cb,'enable','off');
          set(tab3_c.convert_cb,'enable','off');
          
        elseif strcmp(site(site_cur).type,'Doublet')
          set(qs_txt, 'Enable', 'On');
          set(qs_txt, 'String', site(site_cur).qs);  
          set(qs_min_txt,'string', site(site_cur).qs_min);
          set(qs_max_txt,'string', site(site_cur).qs_max);
                   
          set(qs_cb, 'Enable', 'On');
          set(qs_cb, 'Value', site(site_cur).fit(4));
          if site(site_cur).fit(4)             
            set(qs_min_txt, 'Enable', 'On');
            set(qs_max_txt, 'Enable', 'On');
          else
            set(qs_min_txt, 'Enable', 'Off');
            set(qs_max_txt, 'Enable', 'Off');
          end
                    
          set(A12_cb, 'Enable', 'On');
          set(A12_cb, 'Value', site(site_cur).fit(5));
          if site(site_cur).fit(5)
              set(A12_txt, 'Enable', 'On');
              set(A12_txt, 'String', site(site_cur).a12);          
              set(A12_min_txt, 'Enable', 'On');
              set(A12_max_txt, 'Enable', 'On');
              set(A12_min_txt, 'String', site(site_cur).a12_min);
              set(A12_max_txt, 'String', site(site_cur).a12_max);
          else
              set(A12_txt, 'Enable', 'Off');
              set(A12_txt, 'String', site(site_cur).a12);          
              set(A12_min_txt, 'Enable', 'Off');
              set(A12_max_txt, 'Enable', 'Off');
              set(A12_min_txt, 'String', site(site_cur).a12_min);
              set(A12_max_txt, 'String', site(site_cur).a12_max);
          end
          
          set(bhf_txt, 'Enable', 'Off');
          set(bhf_txt, 'String', '');          
          set(bhf_min_txt, 'Enable', 'Off');
          set(bhf_max_txt, 'Enable', 'Off');
          set(bhf_min_txt, 'String', '');
          set(bhf_max_txt, 'String', '');
          set(bhf_cb, 'Enable', 'Off');
          set(bhf_cb, 'Value', 0);
          
          set(A13_txt, 'Enable', 'Off');
          set(A13_txt, 'String', '');     
          set(A13_min_txt, 'Enable', 'Off');
          set(A13_max_txt, 'Enable', 'Off');
          set(A13_min_txt, 'String', '');
          set(A13_max_txt, 'String', '');
          set(A13_cb, 'Enable', 'Off');
          set(A13_cb, 'Value', 0);
          
          set(tab3_c.convert_cb,'enable','on');
          set(tab3_c.convert_cb,'enable','on');
          
        elseif strcmp(site(site_cur).type,'Sextet')
            if  site(site_cur).fit(4)
                set(qs_txt, 'Enable', 'on');
            else
               set(qs_txt, 'Enable', 'off');
            end
          set(qs_txt, 'String', site(site_cur).qs);  
          set(qs_min_txt,'string', site(site_cur).qs_min);
          set(qs_max_txt,'string', site(site_cur).qs_max);
                   
          set(qs_cb, 'Enable', 'On');
          set(qs_cb, 'Value', site(site_cur).fit(4));
          if site(site_cur).fit(4)             
            set(qs_min_txt, 'Enable', 'On');
            set(qs_max_txt, 'Enable', 'On');
          else
            set(qs_min_txt, 'Enable', 'Off');
            set(qs_max_txt, 'Enable', 'Off');
          end
                    
          set(A12_cb, 'Enable', 'On');
          set(A12_cb, 'Value', site(site_cur).fit(5));
          if site(site_cur).fit(5)
              set(A12_txt, 'Enable', 'On');        
              set(A12_min_txt, 'Enable', 'On');
              set(A12_max_txt, 'Enable', 'On');
          else
              set(A12_txt, 'Enable', 'Off');                       
              set(A12_min_txt, 'Enable', 'Off');
              set(A12_max_txt, 'Enable', 'Off');
          end
          
          set(A12_txt, 'String', site(site_cur).a12); 
          set(A12_min_txt, 'String', site(site_cur).a12_min);
          set(A12_max_txt, 'String', site(site_cur).a12_max);
          
          set(bhf_txt, 'Enable', 'On');
          set(bhf_txt, 'String', site(site_cur).bhf);      
         
          set(bhf_cb, 'Enable', 'On');
          set(bhf_cb, 'Value', site(site_cur).fit(6));
          
          if site(site_cur).fit(6)
              set(bhf_min_txt, 'Enable', 'On');
              set(bhf_max_txt, 'Enable', 'On');             
          else
              set(bhf_min_txt, 'Enable', 'Off');
              set(bhf_max_txt, 'Enable', 'Off');
          end
          
          set(bhf_min_txt, 'String', site(site_cur).bhf_min);
          set(bhf_max_txt, 'String', site(site_cur).bhf_max);
          
          set(A13_cb, 'Enable', 'On');
          set(A13_cb, 'Value', site(site_cur).fit(7));
          if site(site_cur).fit(7)
              set(A13_txt, 'Enable', 'On');        
              set(A13_min_txt, 'Enable', 'On');
              set(A13_max_txt, 'Enable', 'On');
          else
              set(A13_txt, 'Enable', 'Off');                       
              set(A13_min_txt, 'Enable', 'Off');
              set(A13_max_txt, 'Enable', 'Off');
          end  
          set(A13_txt, 'String', site(site_cur).a13); 
          set(A13_min_txt, 'String', site(site_cur).a13_min);
          set(A13_max_txt, 'String', site(site_cur).a13_max);
          
           set(tab3_c.convert_cb,'enable','off');
           set(tab3_c.convert_cb,'enable','off');
        end
        
        set(polynom_type,'value',getappdata(0,'bkg_order'));
        set(ft_cb,'value', getappdata(0,'ft_fit'));
        %right panels:
        %1
        set(maxv_txt,'string', getappdata(0,'maxv'));
        set(stdcs_txt,'string', getappdata(0,'stdcs'));
        set(fwhm_s_txt,'string', getappdata(0,'fwhm_s'));
        set(ft_factor_txt,'string', getappdata(0,'ft_factor'));
        set(lor2_cb,'value', getappdata(0,'ft_lor2'));
        set(src_calib_txt,'string', getappdata(0,'src_calib_fwhm'));
        
        %actually here should be the right constrain values:
        %now the xVBF plots:
        if site(site_cur).fit_method==2
            tab3_c.delete_graph_handles();
            tab3_c.create_graph_handles();
        else
            tab3_c.delete_graph_handles();
        end
        
        tab3_c.update();
        %type slider
        for k=1:3
          str=get(site_type, 'String');
          if strcmp(site(site_cur).type, str(k))
              set(site_type,'Value',k);
          end
        end
        %func type slider
        for k=1:4
          str=get(func_type, 'String');
          if strcmp(site(site_cur).func_type, str(k))
              set(func_type,'Value',k);
          end
        end
    end 
    setappdata(0,'update_txt',@update_txt);
end
