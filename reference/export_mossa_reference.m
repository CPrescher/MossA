function export_mossa_reference(outputFile)
% Run this in MATLAB to replace the independently transcribed profile fixtures
% with actual MATLAB outputs. Does not modify the retained MossA checkout.
% Example: export_mossa_reference('matlab-reference-profiles.json')
if nargin < 1, outputFile = 'matlab-reference-profiles.json'; end
addpath(fullfile(fileparts(mfilename('fullpath')), 'MossA'));
x = [-8,-5.1,-2.4,-.6,0,.23,.9,1.7,4.3,5.1,8];
profiles = {'Lorentzian','Gaussian','PseudoVoigt','LorSquared'};
singlets = {@lorentz_curve,@gauss_curve,@pseudov_curve,@lorentz_squared};
doublets = {@doublet,@doublet_g,@doublet_p,@doublet_ls};
sextets = {@sextet,@sextet_g,@sextet_p,@sextet_ls};
types = {'Singlet','Doublet','Sextet'};
cases = struct('kind',{},'profile',{},'absorption',{});
for k=1:3
  for j=1:4
    if k==1
      args={.23,.42,400}; fun=singlets{j};
    elseif k==2
      args={.23,.42,400,1.8,.37}; fun=doublets{j};
    else
      args={.23,.42,400,1.8,1.6,31.2,3.2}; fun=sextets{j};
    end
    if j==3, args{end+1}=.3; end
    args{end+1}=x;
    cases(end+1)=struct('kind',types{k},'profile',profiles{j},'absorption',fun(args{:}));
  end
end
record=struct('provenance','Executed in MATLAB','reference_commit','d201482b7990afbd0e2dcc23e306bfc8d60a5049','x',x,'cases',cases);
fid=fopen(outputFile,'w');
if fid<0, error('Cannot open output file'); end
cleanup=onCleanup(@() fclose(fid));
fprintf(fid,'%s\n',jsonencode(record));
end
