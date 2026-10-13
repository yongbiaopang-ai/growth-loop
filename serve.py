# -*- coding: utf-8 -*-
"""本地开发服务器：让手机通过局域网访问这个 PWA。

用法：
    python serve.py            # 默认 8787 端口
    python serve.py 9000       # 指定端口

手机与电脑连同一个 Wi-Fi，用手机上显示的局域网地址打开即可。
注意：局域网 http 下 Service Worker 不会启用（浏览器要求安全上下文），
所以离线能力要在 GitHub Pages（https）上才完整。本机 127.0.0.1 可以启用。
"""
import http.server
import socket
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 开发期禁用缓存，避免改了文件手机上还是旧的
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))          # 不会真的发包，只为取本机出口 IP
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        ip = lan_ip()
        print("目录：", ROOT, flush=True)
        print("本机：http://127.0.0.1:%d/" % PORT, flush=True)
        print("手机：http://%s:%d/   （手机要和电脑在同一个 Wi-Fi）" % (ip, PORT), flush=True)
        print("Ctrl+C 停止", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")
