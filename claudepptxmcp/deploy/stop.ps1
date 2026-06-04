<#  Stop + remove the claudepptxmcp pm2 apps.  Usage:  .\stop.ps1  #>
pm2 delete claudepptxmcp claudepptxmcp-tunnel 2>$null
pm2 save
pm2 status
