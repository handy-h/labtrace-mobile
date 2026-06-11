# Labtrace Android APK 构建指南

## 环境准备（已自动安装）

我已为你准备好了所有必要的工具：

```
C:\Users\gaoga\.qclaw\tools\
├── jdk-17.0.19+10\          # Java JDK 17
├── android-sdk\              # Android SDK
│   ├── cmdline-tools\        # 命令行工具
│   ├── platforms\android-34  # Android 34 平台
│   ├── build-tools\34.0.0    # 构建工具
│   └── platform-tools\       # adb, fastboot 等
```

## 构建 APK（两种方式）

### 方式一：使用 Android Studio（推荐）

1. **打开 Android Studio**
2. **导入项目**：
   - 选择 `C:\Users\gaoga\.qclaw\workspace\labtrace-android\platforms\android`
   - 或选择 `C:\Users\gaoga\.qclaw\workspace\labtrace-mobile\AndroidWebView.java` 创建新项目

3. **配置项目**：
   - 将 `labtrace-mobile` 中的文件复制到 `app/src/main/assets/www/`
   - 确保 `AndroidManifest.xml` 有文件读取权限

4. **构建 APK**：
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
   - 生成的 APK 在 `app/build/outputs/apk/debug/`

### 方式二：命令行构建（需要 Gradle）

由于网络原因 Gradle 下载较慢，建议手动下载后配置：

```powershell
# 1. 下载 Gradle
# 访问 https://gradle.org/releases/ 下载 gradle-8.5-bin.zip
# 解压到 C:\Users\gaoga\.qclaw\tools\gradle-8.5

# 2. 设置环境变量
$env:JAVA_HOME = "C:\Users\gaoga\.qclaw\tools\jdk-17.0.19+10"
$env:ANDROID_HOME = "C:\Users\gaoga\.qclaw\tools\android-sdk"
$env:GRADLE_HOME = "C:\Users\gaoga\.qclaw\tools\gradle-8.5"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:GRADLE_HOME\bin;$env:PATH"

# 3. 构建
cd C:\Users\gaoga\.qclaw\workspace\labtrace-android
cordova build android
```

## 快速测试（无需构建）

在浏览器中测试应用功能：

```powershell
cd C:\Users\gaoga\.qclaw\workspace\labtrace-mobile
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

## 项目文件说明

### Web 应用文件
- `index.html` - 主页面
- `css/style.css` - 样式
- `js/database.js` - SQLite 数据库管理
- `js/app.js` - 应用逻辑

### Android 包装器
- `AndroidWebView.java` - WebView Activity 代码
- `AndroidManifest.xml` - Android 配置
- `build.gradle` - Gradle 构建配置

## 功能特性

- ✅ 多用户/多医院支持
- ✅ 数据导入（覆盖更新）
- ✅ 检验报告 & 影像报告查看
- ✅ 指标趋势分析（图表）
- ✅ 异常指标统计
- ✅ PDF 查看
- ✅ 离线使用（IndexedDB 存储）

## 注意事项

1. **首次使用**需要导入数据库文件
2. **导入数据**：点击右上角 📥 按钮
3. **文件权限**：Android 6.0+ 需要动态申请存储权限

## 下一步

1. 下载并安装 Android Studio
2. 导入项目并构建 APK
3. 安装到手机测试

如需帮助，请告诉我！
