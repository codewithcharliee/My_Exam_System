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

$clusterPath = Join-Path $env:TEMP ("bingham-exam-integration-db-" + [guid]::NewGuid().ToString('N'))
$databaseName = "bingham_exam_tests_" + [guid]::NewGuid().ToString('N')
$serverStarted = $false
$previousDatabaseUrl = $env:DATABASE_URL
$previousTestDatabaseUrl = $env:TEST_DATABASE_URL

try {
  & $initdb -D $clusterPath -U postgres -A trust --no-locale -E UTF8
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL initdb failed with exit code $LASTEXITCODE"
  }
  & $pgCtl -D $clusterPath -o "-h 127.0.0.1 -p $port" -w start
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL integration server failed to start with exit code $LASTEXITCODE"
  }
  $serverStarted = $true

  & $createdb -h 127.0.0.1 -p $port -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the isolated integration-test database"
  }

  $env:TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:${port}/${databaseName}?schema=public"
  $env:DATABASE_URL = $env:TEST_DATABASE_URL

  npx prisma generate --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma client generation failed with exit code $LASTEXITCODE"
  }

  npx prisma db push --schema prisma/schema.prisma --skip-generate
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma schema setup failed with exit code $LASTEXITCODE"
  }

  npx vitest run --project unit --testNamePattern "IT-" components/exam/__tests__/integration-workflows.test.ts
  if ($LASTEXITCODE -ne 0) {
    throw "Project-aligned database integration tests failed with exit code $LASTEXITCODE"
  }

  npx vitest run --project unit components/exam/__tests__/response-synchronization.unit.test.ts
  if ($LASTEXITCODE -ne 0) {
    throw "Integration workflow tests failed with exit code $LASTEXITCODE"
  }

  npx vitest run --project browser --no-file-parallelism --testTimeout 30000 --testNamePattern "persists answer and navigation state|saves the initial Q10 answer|creates continuous versions for Q10 edits|debounces rapid typing|preserves long, multiline|keeps Q10 and Q11 versions independent|keeps the newest response|restores the exact last local response|recovers the newest locally saved text|restores the latest locally persisted draft|synchronizes exact offline versions once online|acknowledges a valid submission and exposes a server-generated receipt|recovers the persisted receipt after a lost response|keeps the pending state during timeout and retry scenarios" components/exam/__tests__/autosave.browser.test.tsx components/exam/__tests__/response-recovery.browser.test.tsx components/exam/__tests__/response-synchronization.browser.test.tsx components/exam/__tests__/submission-receipt.browser.test.tsx
  if ($LASTEXITCODE -ne 0) {
    throw "Integration browser workflow tests failed with exit code $LASTEXITCODE"
  }

  npx vitest run --project browser --no-file-parallelism --testTimeout 30000 components/exam/__tests__/attempt-session-locking.browser.test.tsx
  if ($LASTEXITCODE -ne 0) {
    throw "Attempt-session browser workflow tests failed with exit code $LASTEXITCODE"
  }
}
finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
  if ($null -eq $previousTestDatabaseUrl) {
    Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:TEST_DATABASE_URL = $previousTestDatabaseUrl
  }

  if ($serverStarted) {
    & $pgCtl -D $clusterPath -m fast -w stop
  }
  if (Test-Path -LiteralPath $clusterPath) {
    Remove-Item -LiteralPath $clusterPath -Recurse -Force
  }
}
