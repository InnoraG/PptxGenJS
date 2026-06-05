<#  Stop + remove the betterpptx-mcp pm2 apps.  Usage:  .\stop.ps1  #>
pm2 delete betterpptx-mcp betterpptx-mcp-tunnel 2>$null
pm2 save
pm2 status
