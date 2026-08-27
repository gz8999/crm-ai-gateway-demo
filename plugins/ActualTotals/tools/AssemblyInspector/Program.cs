using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

if (args.Length != 2)
{
    Console.Error.WriteLine("Usage: AssemblyInspector <assembly.dll> <output.json>");
    return 2;
}

var assemblyPath = Path.GetFullPath(args[0]);
var outputPath = Path.GetFullPath(args[1]);
var bytes = await File.ReadAllBytesAsync(assemblyPath);
using var stream = File.OpenRead(assemblyPath);
using var pe = new PEReader(stream);
if (!pe.HasMetadata) throw new InvalidDataException("Input file is not a managed assembly.");
var reader = pe.GetMetadataReader();
var definition = reader.GetAssemblyDefinition();
var references = reader.AssemblyReferences.Select(handle => reader.GetAssemblyReference(handle)).Select(reference => new
{
    name = reader.GetString(reference.Name),
    version = reference.Version.ToString(),
    publicKeyToken = Convert.ToHexString(reader.GetBlobBytes(reference.PublicKeyOrToken)).ToLowerInvariant()
}).OrderBy(reference => reference.name).ToArray();
var typeNames = reader.TypeDefinitions.Select(handle => reader.GetTypeDefinition(handle)).Select(type => $"{reader.GetString(type.Namespace)}.{reader.GetString(type.Name)}").Where(name => !name.EndsWith(".<Module>", StringComparison.Ordinal)).OrderBy(name => name).ToArray();
var flags = pe.PEHeaders.CorHeader?.Flags ?? 0;
var publicKey = reader.GetBlobBytes(definition.PublicKey);
var publicKeyToken = publicKey.Length == 0
    ? string.Empty
    : Convert.ToHexString(SHA1.HashData(publicKey).TakeLast(8).Reverse().ToArray()).ToLowerInvariant();
var forbiddenPatterns = new[] { "/Users/", "\\Users\\", "crm5.dynamics.com", "client_secret", "api_key", "LLM_API_KEY", "[AI-DEMO]" };
var ascii = Encoding.UTF8.GetString(bytes);
var unicode = Encoding.Unicode.GetString(bytes);
var forbiddenHits = forbiddenPatterns.Where(pattern => ascii.Contains(pattern, StringComparison.OrdinalIgnoreCase) || unicode.Contains(pattern, StringComparison.OrdinalIgnoreCase)).ToArray();
var allowedReferences = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "mscorlib", "System", "System.Core", "System.Data", "System.Runtime.Serialization", "System.ServiceModel", "Microsoft.Xrm.Sdk"
};
var disallowedReferences = references.Where(reference => !allowedReferences.Contains(reference.name)).Select(reference => reference.name).ToArray();
var report = new
{
    file = Path.GetFileName(assemblyPath),
    sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
    sizeBytes = bytes.Length,
    assemblyName = reader.GetString(definition.Name),
    version = definition.Version.ToString(),
    strongNameSigned = (flags & CorFlags.StrongNameSigned) != 0 && publicKey.Length > 0,
    publicKeyPresent = publicKey.Length > 0,
    publicKeyToken,
    references,
    disallowedReferences,
    typeNames,
    expectedPluginTypes = new[]
    {
        "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreValidationPlugin",
        "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreOperationPlugin",
        "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPostOperationPlugin"
    },
    customCoreAssemblyReferencePresent = references.Any(reference => reference.name.Equals("CrmAiGateway.ActualTotals.Core", StringComparison.OrdinalIgnoreCase)),
    forbiddenHits,
    passed = (flags & CorFlags.StrongNameSigned) != 0 && publicKey.Length > 0 && disallowedReferences.Length == 0 && forbiddenHits.Length == 0 && !references.Any(reference => reference.name.Equals("CrmAiGateway.ActualTotals.Core", StringComparison.OrdinalIgnoreCase))
};
Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
await File.WriteAllTextAsync(outputPath, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine(JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
return report.passed ? 0 : 1;
