#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dwmapi.h>
#include <cstdlib>
#include <cwchar>
#include <iostream>

static bool IsDesktopWindow(HWND window) {
    wchar_t className[128] = {};
    GetClassNameW(window, className, 127);
    return wcscmp(className, L"Progman") == 0 ||
           wcscmp(className, L"WorkerW") == 0 ||
           wcscmp(className, L"Shell_TrayWnd") == 0;
}

static bool IsForegroundFullscreen() {
    HWND window = GetForegroundWindow();
    if (!window || !IsWindowVisible(window) || IsIconic(window) || IsDesktopWindow(window)) return false;

    RECT bounds = {};
    if (FAILED(DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS, &bounds, sizeof(bounds))) &&
        !GetWindowRect(window, &bounds)) return false;

    HMONITOR monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
    MONITORINFO info = { sizeof(info) };
    if (!GetMonitorInfoW(monitor, &info)) return false;

    constexpr LONG tolerance = 3;
    return std::abs(bounds.left - info.rcMonitor.left) <= tolerance &&
           std::abs(bounds.top - info.rcMonitor.top) <= tolerance &&
           std::abs(bounds.right - info.rcMonitor.right) <= tolerance &&
           std::abs(bounds.bottom - info.rcMonitor.bottom) <= tolerance;
}

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) return 2;
    const DWORD parentPid = static_cast<DWORD>(_wtoi(argv[1]));
    HANDLE parent = OpenProcess(SYNCHRONIZE, FALSE, parentPid);
    if (!parent) return 3;
    SetProcessDPIAware();

    while (WaitForSingleObject(parent, 0) == WAIT_TIMEOUT) {
        std::cout << (IsForegroundFullscreen() ? "1\n" : "0\n") << std::flush;
        Sleep(600);
    }
    CloseHandle(parent);
    return 0;
}
