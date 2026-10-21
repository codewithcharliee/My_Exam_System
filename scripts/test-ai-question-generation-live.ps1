$ErrorActionPreference = 'Stop'

$postgresBin = 'C:\Program Files\PostgreSQL\18\bin'
$initdb = Join-Path $postgresBin 'initdb.exe'
$pgCtl = Join-Path $postgresBin 'pg_ctl.exe'
$createdb = Join-Path $postgresBin 'createdb.exe'

foreach ($tool in @($initdb, $pgCtl, $createdb)) {
  if (-not (Test-Path -LiteralPath $tool)) {
    throw "Required PostgreSQL tool was not found: $tool"
  }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$clusterPath = Join-Path $env:TEMP ("bingham-live-ai-db-" + [guid]::NewGuid().ToString('N'))
$databaseName = "bingham_live_ai_tests_" + [guid]::NewGuid().ToString('N')
$serverStarted = $false
$previousDatabaseUrl = $env:DATABASE_URL
$previousTestDatabaseUrl = $env:TEST_DATABASE_URL
$previousLiveFlag = $env:RUN_LIVE_AI_GENERATION

try {
  & $initdb -D $clusterPath -U postgres -A trust --no-locale -E UTF8
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initdb failed with exit code $LASTEXITCODE" }

  & $pgCtl -D $clusterPath -o "-h 127.0.0.1 -p $port" -w start
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL integration server failed with exit code $LASTEXITCODE" }
  $serverStarted = $true

  & $createdb -h 127.0.0.1 -p $port -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated live-AI database' }

  $env:TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:${port}/${databaseName}?schema=public"
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  $env:RUN_LIVE_AI_GENERATION = '1'

  npx prisma db push --schema prisma/schema.prisma --skip-generate
  if ($LASTEXITCODE -ne 0) { throw "Prisma schema setup failed with exit code $LASTEXITCODE" }

  npx vitest run --project unit --testTimeout 120000 components/exam/__tests__/ai-question-generation-live.integration.test.ts
  if ($LASTEXITCODE -ne 0) { throw "Live AI generation integration test failed with exit code $LASTEXITCODE" }
}
finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $previousDatabaseUrl }
  if ($null -eq $previousTestDatabaseUrl) { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:TEST_DATABASE_URL = $previousTestDatabaseUrl }
  if ($null -eq $previousLiveFlag) { Remove-Item Env:RUN_LIVE_AI_GENERATION -ErrorAction SilentlyContinue }
  else { $env:RUN_LIVE_AI_GENERATION = $previousLiveFlag }

  if ($serverStarted) { & $pgCtl -D $clusterPath -m fast -w stop }
  if (Test-Path -LiteralPath $clusterPath) { Remove-Item -LiteralPath $clusterPath -Recurse -Force }
}