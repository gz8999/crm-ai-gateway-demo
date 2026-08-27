param(
    [Parameter(Mandatory = $true)][string]$RepositoryRoot
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path $RepositoryRoot).Path
$pluginRoot = Join-Path $repo "plugins/ActualTotals"
$testProject = Join-Path $pluginRoot "tests/CrmAiGateway.ActualTotals.Core.Tests/CrmAiGateway.ActualTotals.Core.Tests.csproj"
$pluginProject = Join-Path $pluginRoot "src/CrmAiGateway.ActualTotals.Plugin/CrmAiGateway.ActualTotals.Plugin.csproj"
$inspectorProject = Join-Path $pluginRoot "tools/AssemblyInspector/AssemblyInspector.csproj"
$ciDirectory = Join-Path $pluginRoot ".ci"
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot "artifacts"))
$artifactDirectory = [IO.Path]::GetFullPath((Join-Path $artifactRoot "Release"))
$testResults = Join-Path $ciDirectory "TestResults"
$keyPath = Join-Path $ciDirectory "actual-totals-ci-demo.snk"

function Assert-SafeReleaseDirectory([string]$ReleaseDirectory, [string]$ExpectedArtifactRoot, [string]$RepositoryRoot) {
    if ([string]::IsNullOrWhiteSpace($ReleaseDirectory)) { throw "Release artifact path must not be empty." }
    $resolvedRelease = [IO.Path]::GetFullPath($ReleaseDirectory)
    $resolvedArtifactRoot = [IO.Path]::GetFullPath($ExpectedArtifactRoot)
    $resolvedRepository = [IO.Path]::GetFullPath($RepositoryRoot)
    $expectedRelease = [IO.Path]::GetFullPath((Join-Path $resolvedArtifactRoot "Release"))
    $repositoryPrefix = $resolvedRepository.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $artifactPrefix = $resolvedArtifactRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedRelease.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Release artifact path is outside the repository." }
    if (-not $resolvedRelease.StartsWith($artifactPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Release artifact path is outside the ActualTotals artifact root." }
    if (-not $resolvedRelease.Equals($expectedRelease, [StringComparison]::OrdinalIgnoreCase)) { throw "Release artifact path must end exactly at artifacts/Release." }
    if ($resolvedRelease.Equals($resolvedRepository, [StringComparison]::OrdinalIgnoreCase) -or $resolvedRelease.Equals($pluginRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to clean a protected repository or Plugin directory." }
    return $resolvedRelease
}

function Initialize-ReleaseDirectory([string]$ReleaseDirectory, [string]$ExpectedArtifactRoot, [string]$RepositoryRoot) {
    $safeRelease = Assert-SafeReleaseDirectory $ReleaseDirectory $ExpectedArtifactRoot $RepositoryRoot
    if (Test-Path -LiteralPath $safeRelease) { Remove-Item -LiteralPath $safeRelease -Recurse -Force }
    New-Item -ItemType Directory -Path $safeRelease -Force | Out-Null
    if (-not (Test-Path -LiteralPath $safeRelease -PathType Container)) { throw "Release artifact directory could not be created." }
    return $safeRelease
}

function Assert-ArtifactFile([string]$FilePath, [string]$Description) {
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw "$Description was not created." }
}

if (Test-Path -LiteralPath $ciDirectory) { Remove-Item -LiteralPath $ciDirectory -Recurse -Force }
New-Item $ciDirectory -ItemType Directory -Force | Out-Null
New-Item $testResults -ItemType Directory -Force | Out-Null
$artifactDirectory = Initialize-ReleaseDirectory $artifactDirectory $artifactRoot $repo

try {
    $signingKeyBase64 = [Environment]::GetEnvironmentVariable("ACTUAL_TOTALS_SNK_BASE64")
    if ([string]::IsNullOrWhiteSpace($signingKeyBase64)) {
        throw "ACTUAL_TOTALS_SNK_BASE64 is required. Random signing-key fallback is disabled."
    }
    try {
        $signingKeyBytes = [Convert]::FromBase64String($signingKeyBase64)
    }
    catch {
        throw "ACTUAL_TOTALS_SNK_BASE64 is not valid Base64."
    }
    if ($signingKeyBytes.Length -eq 0) { throw "ACTUAL_TOTALS_SNK_BASE64 decoded to an empty key." }
    [IO.File]::WriteAllBytes($keyPath, $signingKeyBytes)
    $signingKeyBytes = $null
    $signingKeyBase64 = $null

    $sn = (Get-Command sn.exe -ErrorAction SilentlyContinue).Source
    if (-not $sn) {
        $searchRoots = @("${env:ProgramFiles(x86)}\Microsoft SDKs", "${env:ProgramFiles(x86)}\Windows Kits") | Where-Object { Test-Path $_ }
        $sn = Get-ChildItem $searchRoots -Filter sn.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $sn) { throw "sn.exe was not found on the Windows runner." }
    & $sn -q -p $keyPath (Join-Path $ciDirectory "actual-totals-ci-demo-public.snk")
    if ($LASTEXITCODE -ne 0) { throw "The injected strong-name key is invalid." }

    dotnet restore $testProject
    if ($LASTEXITCODE -ne 0) { throw "Test restore failed." }
    dotnet restore $pluginProject
    if ($LASTEXITCODE -ne 0) { throw "Plugin restore failed." }
    dotnet restore $inspectorProject
    if ($LASTEXITCODE -ne 0) { throw "Inspector restore failed." }

    dotnet test $testProject --configuration Release --no-restore --logger "trx;LogFileName=actual-totals-tests.trx" --results-directory $testResults
    if ($LASTEXITCODE -ne 0) { throw "C# unit tests failed." }

    dotnet build $pluginProject --configuration Release --no-restore /p:SignAssembly=true /p:AssemblyOriginatorKeyFile=$keyPath
    if ($LASTEXITCODE -ne 0) { throw "Plugin Release build failed." }

    $builtDll = Join-Path $pluginRoot "src/CrmAiGateway.ActualTotals.Plugin/bin/Release/net462/CrmAiGateway.ActualTotals.Plugin.dll"
    $artifactDll = Join-Path $artifactDirectory "CrmAiGateway.ActualTotals.Plugin.dll"
    Assert-ArtifactFile $builtDll "Expected Plugin DLL"
    Copy-Item -LiteralPath $builtDll -Destination $artifactDll
    Assert-ArtifactFile $artifactDll "Packaged Plugin DLL"

    $inspectionPath = Join-Path $artifactDirectory "assembly-inspection.json"
    dotnet run --project $inspectorProject --configuration Release -- $artifactDll $inspectionPath
    if ($LASTEXITCODE -ne 0) { throw "Assembly inspection failed." }
    Assert-ArtifactFile $inspectionPath "Assembly inspection report"
    & $sn -q -vf $artifactDll
    if ($LASTEXITCODE -ne 0) { throw "Strong-name verification failed." }

    [xml]$trx = Get-Content (Join-Path $testResults "actual-totals-tests.trx")
    $counters = $trx.TestRun.ResultSummary.Counters
    $summary = [ordered]@{
        total = [int]$counters.total
        executed = [int]$counters.executed
        passed = [int]$counters.passed
        failed = [int]$counters.failed
        skipped = [int]$counters.notExecuted
        report = "CI-only TRX; summarized in test-summary.json"
    }
    $testSummaryPath = Join-Path $artifactDirectory "test-summary.json"
    $summary | ConvertTo-Json | Set-Content $testSummaryPath -Encoding utf8
    Assert-ArtifactFile $testSummaryPath "Test summary"

    $inspection = Get-Content $inspectionPath | ConvertFrom-Json
    $customDlls = @(Get-ChildItem $artifactDirectory -Filter *.dll)
    $oneCustomPluginDllOnly = $customDlls.Count -eq 1 -and $customDlls[0].Name -eq "CrmAiGateway.ActualTotals.Plugin.dll"
    $dependencyAllowlistPassed = @($inspection.disallowedReferences).Count -eq 0
    $secretScanPassed = @($inspection.forbiddenHits).Count -eq 0
    $stablePublicKeyTokenPresent = -not [string]::IsNullOrWhiteSpace([string]$inspection.publicKeyToken)
    $excludedArtifactCount = @(Get-ChildItem $artifactDirectory -Recurse -File | Where-Object { $_.Extension -in @(".pdb", ".snk") }).Count
    $gates = [ordered]@{
        npmTestPassed = $true
        npmBuildPassed = $true
        dotnetRestorePassed = $true
        xunitPassed = ([int]$summary.failed -eq 0 -and [int]$summary.executed -gt 0)
        net462ReleaseBuildPassed = $true
        dllExists = (Test-Path $artifactDll)
        oneCustomPluginDllOnly = $oneCustomPluginDllOnly
        assemblyInspectionPassed = [bool]$inspection.passed
        dependencyAllowlistPassed = $dependencyAllowlistPassed
        secretScanPassed = $secretScanPassed
        stablePublicKeyTokenPresent = $stablePublicKeyTokenPresent
        sha256Present = -not [string]::IsNullOrWhiteSpace([string]$inspection.sha256)
        noPdbInArtifact = $excludedArtifactCount -eq 0
        noSnkInArtifact = $excludedArtifactCount -eq 0
    }
    $deployable = -not ($gates.Values -contains $false)
    $failedGates = @($gates.GetEnumerator() | Where-Object { -not [bool]$_.Value } | Select-Object -ExpandProperty Key)
    $manifest = [ordered]@{
        generatedAtUtc = [DateTime]::UtcNow.ToString("o")
        artifact = "CrmAiGateway.ActualTotals.Plugin.dll"
        sha256 = $inspection.sha256
        sizeBytes = $inspection.sizeBytes
        targetFramework = "net462"
        configuration = "Release"
        strongNameSigned = $inspection.strongNameSigned
        publicKeyToken = $inspection.publicKeyToken
        signingKeyPolicy = "Stable Demo key injected from ACTUAL_TOTALS_SNK_BASE64 and deleted before artifact upload"
        dependencies = $inspection.references
        customAssemblyDependencies = @()
        tests = $summary
        gates = $gates
        dataverseConnected = $false
        deployable = $deployable
        deploymentBlockers = $failedGates
    }
    $buildManifestPath = Join-Path $artifactDirectory "build-manifest.json"
    $manifest | ConvertTo-Json -Depth 8 | Set-Content $buildManifestPath -Encoding utf8
    Assert-ArtifactFile $buildManifestPath "Build manifest"
    if (-not $deployable) { throw "One or more deployable gates failed." }
    $shaPath = Join-Path $artifactDirectory "plugin-sha256.txt"
    $dependencyPath = Join-Path $artifactDirectory "dependency-list.json"
    "{0}  CrmAiGateway.ActualTotals.Plugin.dll" -f $inspection.sha256 | Set-Content $shaPath -Encoding ascii
    $inspection.references | ConvertTo-Json -Depth 4 | Set-Content $dependencyPath -Encoding utf8
    Assert-ArtifactFile $shaPath "Plugin SHA-256 file"
    Assert-ArtifactFile $dependencyPath "Dependency list"

    $expectedArtifacts = @(
        "CrmAiGateway.ActualTotals.Plugin.dll",
        "assembly-inspection.json",
        "build-manifest.json",
        "dependency-list.json",
        "plugin-sha256.txt",
        "test-summary.json"
    )
    $artifactDirectories = @(Get-ChildItem -LiteralPath $artifactDirectory -Directory -Recurse)
    if ($artifactDirectories.Count -ne 0) { throw "Release artifact must not contain nested directories." }
    $actualArtifacts = @(Get-ChildItem -LiteralPath $artifactDirectory -File | Select-Object -ExpandProperty Name | Sort-Object)
    if (Compare-Object ($expectedArtifacts | Sort-Object) $actualArtifacts) { throw "Release artifact contains unexpected or missing files." }
    if ($actualArtifacts.Count -ne 6) { throw "Release artifact must contain exactly six files." }
}
finally {
    if (Test-Path $keyPath) { Remove-Item $keyPath -Force }
    $publicKeyPath = Join-Path $ciDirectory "actual-totals-ci-demo-public.snk"
    if (Test-Path $publicKeyPath) { Remove-Item $publicKeyPath -Force }
}
