#include <iouring_runtime/observability/Logging.h>
#include <iouring_runtime/web/WebServer.h>

#include <algorithm>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <limits>
#include <optional>
#include <string>
#include <string_view>

using iouring_runtime::web::HttpStatus;
using iouring_runtime::web::RequestContext;

namespace {

template <typename T>
T ReadUnsignedEnv(const char* name, T fallback) {
    if (const char* raw = std::getenv(name)) {
        const auto value = std::stoull(raw);
        if (value > static_cast<unsigned long long>(std::numeric_limits<T>::max())) {
            return fallback;
        }
        return static_cast<T>(value);
    }
    return fallback;
}

std::string ReadStringEnv(const char* name, std::string fallback) {
    if (const char* raw = std::getenv(name)) {
        return raw;
    }
    return fallback;
}

std::chrono::milliseconds ReadMillisecondsEnv(
    const char* name, std::chrono::milliseconds fallback) {
    if (const char* raw = std::getenv(name)) {
        return std::chrono::milliseconds(std::stoll(raw));
    }
    return fallback;
}

using WorkerAffinityMode = iouring_runtime::web::WebServerConfig::WorkerAffinityMode;

WorkerAffinityMode ReadWorkerAffinityEnv(const char* name,
                                         WorkerAffinityMode fallback) {
    if (const char* raw = std::getenv(name)) {
        const std::string value = raw;
        if (value == "off") return WorkerAffinityMode::kOff;
        if (value == "physical") return WorkerAffinityMode::kPhysicalCores;
        if (value == "logical") return WorkerAffinityMode::kLogicalCpus;
    }
    return fallback;
}

void ConfigureLoggingFromEnv() {
    iouring_runtime::observability::ConfigureLoggingFromEnv("PORTFOLIO_LOG_LEVEL");
}

char ToLowerAscii(char ch) {
    if (ch >= 'A' && ch <= 'Z') {
        return static_cast<char>(ch + ('a' - 'A'));
    }
    return ch;
}

std::string_view TrimAsciiWhitespace(std::string_view text) {
    while (!text.empty() &&
           (text.front() == ' ' || text.front() == '\t' ||
            text.front() == '\r' || text.front() == '\n')) {
        text.remove_prefix(1);
    }
    while (!text.empty() &&
           (text.back() == ' ' || text.back() == '\t' ||
            text.back() == '\r' || text.back() == '\n')) {
        text.remove_suffix(1);
    }
    return text;
}

bool EqualsIgnoreCase(std::string_view lhs, std::string_view rhs) {
    if (lhs.size() != rhs.size()) {
        return false;
    }
    for (std::size_t i = 0; i < lhs.size(); ++i) {
        if (ToLowerAscii(lhs[i]) != ToLowerAscii(rhs[i])) {
            return false;
        }
    }
    return true;
}

std::string_view HostNameWithoutPort(std::string_view host) {
    host = TrimAsciiWhitespace(host);
    if (host.empty()) {
        return {};
    }
    if (host.front() == '[') {
        const auto end = host.find(']');
        return end == std::string_view::npos ? host : host.substr(0, end + 1);
    }
    const auto colon = host.find(':');
    return colon == std::string_view::npos ? host : host.substr(0, colon);
}

bool IsRetiredPublicHost(std::string_view host_header) {
    const auto host = HostNameWithoutPort(host_header);
    return EqualsIgnoreCase(host, "portfolio.mintcocoa.cc");
}

int HexValue(char ch) {
    if (ch >= '0' && ch <= '9') return ch - '0';
    if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
    if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
    return -1;
}

std::optional<std::string> UrlDecode(std::string_view text) {
    std::string out;
    out.reserve(text.size());
    for (std::size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '+') {
            out += ' ';
            continue;
        }
        if (text[i] != '%') {
            out += text[i];
            continue;
        }
        if (i + 2 >= text.size()) return std::nullopt;
        const int hi = HexValue(text[i + 1]);
        const int lo = HexValue(text[i + 2]);
        if (hi < 0 || lo < 0) return std::nullopt;
        out += static_cast<char>((hi << 4) | lo);
        i += 2;
    }
    return out;
}

std::string_view ExtensionOf(std::string_view path) {
    const auto dot = path.rfind('.');
    if (dot == std::string_view::npos) return {};
    return path.substr(dot);
}

std::string_view MimeType(std::string_view path) {
    const auto ext = ExtensionOf(path);
    if (ext == ".html" || ext == ".htm") return "text/html; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".js") return "application/javascript; charset=utf-8";
    if (ext == ".json" || ext == ".webmanifest") return "application/json";
    if (ext == ".pdf") return "application/pdf";
    if (ext == ".png") return "image/png";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".svg") return "image/svg+xml";
    if (ext == ".ico") return "image/x-icon";
    if (ext == ".woff") return "font/woff";
    if (ext == ".woff2") return "font/woff2";
    if (ext == ".ttf") return "font/ttf";
    if (ext == ".txt" || ext == ".md") return "text/plain; charset=utf-8";
    return "application/octet-stream";
}

std::optional<std::filesystem::path> SafeRelativePath(std::string_view raw_path) {
    auto decoded = UrlDecode(raw_path);
    if (!decoded) return std::nullopt;
    std::replace(decoded->begin(), decoded->end(), '\\', '/');
    while (!decoded->empty() && decoded->front() == '/') {
        decoded->erase(decoded->begin());
    }
    if (decoded->empty()) {
        *decoded = "index.html";
    }

    std::filesystem::path relative;
    for (const auto& part : std::filesystem::path(*decoded)) {
        const auto value = part.string();
        if (value.empty() || value == ".") continue;
        if (value == "..") return std::nullopt;
        relative /= part;
    }
    if (relative.empty()) {
        return std::filesystem::path("index.html");
    }
    return relative;
}

void SendText(RequestContext& ctx, HttpStatus status, std::string body) {
    ctx.response.Status(status)
        .ContentType("text/plain; charset=utf-8")
        .Body(std::move(body))
        .Send();
}

void SendInlineUnusedPage(RequestContext& ctx) {
    ctx.response.ContentType("text/html; charset=utf-8")
        .Header("Cache-Control", "no-cache")
        .Header("X-Robots-Tag", "noindex")
        .Body(R"(<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>사용하지 않는 포트폴리오 경로</title>
</head>
<body>
  <main>
    <h1>portfolio.mintcocoa.cc는 더 이상 사용하지 않습니다.</h1>
    <p>상세 포트폴리오 문서는 GitHub Pages 경로로 이동했습니다.</p>
    <p><a href="https://mint-cocoa.github.io/portfolio/">https://mint-cocoa.github.io/portfolio/</a></p>
  </main>
</body>
</html>
)")
        .Send();
}

void ServeUnusedPage(RequestContext& ctx, const std::filesystem::path& root,
                     std::uint64_t max_file_bytes) {
    const auto path = root / "unused.html";
    std::error_code ec;
    if (!std::filesystem::is_regular_file(path, ec)) {
        SendInlineUnusedPage(ctx);
        return;
    }
    const auto size = std::filesystem::file_size(path, ec);
    if (ec || size > max_file_bytes) {
        SendInlineUnusedPage(ctx);
        return;
    }

    ctx.response.ContentType("text/html; charset=utf-8")
        .Header("Cache-Control", "no-cache")
        .Header("X-Robots-Tag", "noindex");
    if (!ctx.response.SendFile(path.string(), "text/html; charset=utf-8")) {
        SendInlineUnusedPage(ctx);
    }
}

void ServeStatic(RequestContext& ctx, const std::filesystem::path& root,
                 std::string_view raw_path,
                 std::uint64_t max_file_bytes) {
    const auto safe = SafeRelativePath(raw_path);
    if (!safe) {
        SendText(ctx, HttpStatus::kBadRequest, "Bad Request");
        return;
    }

    auto path = root / *safe;
    std::error_code ec;
    if (!std::filesystem::is_regular_file(path, ec) && safe->extension().empty()) {
        path = root / *safe / "index.html";
    }
    if (!std::filesystem::is_regular_file(path, ec)) {
        SendText(ctx, HttpStatus::kNotFound, "Not Found");
        return;
    }
    const auto size = std::filesystem::file_size(path, ec);
    if (ec || size > max_file_bytes) {
        SendText(ctx, HttpStatus::kNotFound, "Not Found");
        return;
    }

    const bool no_cache = path.filename() == "index.html" ||
                          path.extension() == ".html";
    ctx.response.ContentType(MimeType(path.string()))
        .Header("Cache-Control", no_cache ? "no-cache" : "public, max-age=3600");
    if (!ctx.response.SendFile(path.string(), MimeType(path.string()))) {
        SendText(ctx, HttpStatus::kInternalServerError, "Internal Server Error");
    }
}

} // namespace

int main() {
    ConfigureLoggingFromEnv();

    const auto static_root = std::filesystem::path(
        ReadStringEnv("PORTFOLIO_STATIC_ROOT", "/usr/share/portfolio"));
    const auto max_file_bytes =
        ReadUnsignedEnv<std::uint64_t>("PORTFOLIO_MAX_STATIC_FILE_BYTES",
                                       16ULL * 1024ULL * 1024ULL);

    iouring_runtime::web::WebServerConfig config;
    config.host = ReadStringEnv("PORTFOLIO_HOST", "0.0.0.0");
    config.port = ReadUnsignedEnv<std::uint16_t>("PORTFOLIO_PORT", 3000);
    config.worker_count = ReadUnsignedEnv<std::uint16_t>("PORTFOLIO_WORKERS", 1);
    config.worker_affinity =
        ReadWorkerAffinityEnv("PORTFOLIO_WORKER_AFFINITY", config.worker_affinity);
    config.timeouts.inactivity =
        ReadMillisecondsEnv("PORTFOLIO_INACTIVITY_TIMEOUT_MS",
                            std::chrono::milliseconds{60000});
    config.timeouts.request =
        ReadMillisecondsEnv("PORTFOLIO_REQUEST_TIMEOUT_MS",
                            std::chrono::milliseconds{60000});

    iouring_runtime::web::WebServer server(config);
    iouring_runtime::web::WebServer::InstallStopSignalHandlers();

    server.Get("/healthz", [](RequestContext& ctx) {
        ctx.response.ContentType("text/plain; charset=utf-8").Body("ok").Send();
    });
    server.Get("/", [&](RequestContext& ctx) {
        if (IsRetiredPublicHost(ctx.request.GetHeader("Host"))) {
            ServeUnusedPage(ctx, static_root, max_file_bytes);
            return;
        }
        ServeStatic(ctx, static_root, "/", max_file_bytes);
    });
    server.Get("/*path", [&](RequestContext& ctx) {
        if (IsRetiredPublicHost(ctx.request.GetHeader("Host"))) {
            ServeUnusedPage(ctx, static_root, max_file_bytes);
            return;
        }
        ServeStatic(ctx, static_root, ctx.request.ParamDecoded("path"),
                    max_file_bytes);
    });

    server.Start();
    iouring_runtime::web::WebServer::WaitForStopSignal(std::chrono::seconds(1));
    server.Stop();
    return 0;
}
