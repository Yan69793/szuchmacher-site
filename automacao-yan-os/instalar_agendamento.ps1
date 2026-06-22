# YanOS — Task Scheduler (semanal)
$action  = New-ScheduledTaskAction -Execute 'E:\Diretorio\Claude\Site\automacao-yan-os\venv\Scripts\python.exe' `
           -Argument 'E:\Diretorio\Claude\Site\automacao-yan-os\main.py' `
           -WorkingDirectory 'E:\Diretorio\Claude\Site\automacao-yan-os'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At '18:30'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'YanOS_Briefing' `
    -Action $action -Trigger $trigger -Settings $settings -Force
Write-Host 'YanOS: tarefa criada para Friday as 18:30 (semanal)'
