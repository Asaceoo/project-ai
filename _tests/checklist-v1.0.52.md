# 发布清单 v1.0.52（托盘 + 保存退出）

## 本版功能
- app.py 新增 `_start_tray`：pystray 系统托盘，图标 = assets/app.ico（256×256 缩至 64），tooltip「ACE 开发助手 vX.Y.Z」
- 托盘交互：单击/双击（default 动作）+ 右键菜单「显示主窗口」= restore+show；「保存退出」= flushPersist→saveLogs→flushStore → window.destroy()
- 死锁防线：落盘在守护线程执行，3s join 超时 → destroy + os._exit(0) 兜底（evaluate_js 随机死锁前科，v1.0.29-36 红线延续）
- 降级路径：pystray/Pillow 缺失或托盘创建失败 → 无托盘运行不阻塞；ico 缺失 → PIL 画品牌蓝兜底图标
- 主循环结束后 icon.stop() 清理图标；X 关闭行为不变（confirm_close + closing 落盘）

## 验证链
| 项 | 结果 |
|---|---|
| py_compile app.py/build.py | OK |
| ico 加载（256×256）/兜底图标绘制/pystray Menu+Icon 实例化（后端 pystray._win32） | OK |
| build.py 预检 | pywebview + pystray/Pillow 可用（托盘启用） |
| verify.js（前端无改动回归） | 全部通过（576 断言） |
| deadbtn.js | 未定义函数数 0 |
| warn-*.txt | webview/pystray._win32 无缺失；10 条均为 Linux/macOS 后端良性告警 |
| exe 冒烟 45s | 双进程稳定（13,520K + 173,572K） |
| 打包 | SupplyDevLocal-v1.0.52.exe（31.8 MB），--add-data app.ico + --hidden-import pystray._win32 |

## 已知限制
- 托盘「保存退出」若遇 evaluate_js 死锁（历史偶发），3 秒后强退——极端情况下最近一次防抖窗口内的变更可能未落盘，由 localStorage 镜像 + 5 分钟周期备份兜底
- 托盘退出不弹确认框（设计如此）；X 关闭仍有确认框
- 单实例互斥照旧：双开会弹窗拦截

## 待真机确认（用户）
1. 任务栏托盘出现蓝色徽章图标，悬停显示「ACE 开发助手 v1.0.52」
2. 左键/双击托盘 → 主窗口呼出（最小化时恢复）
3. 右键 → 保存退出：应用关闭、进程消失、重新打开数据完整
4. X 按钮关闭行为与之前一致
