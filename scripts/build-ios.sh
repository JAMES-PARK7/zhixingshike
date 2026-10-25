#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-unsigned}"
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo '需要 macOS 和完整 Xcode。也可使用仓库的 GitHub Actions macOS 构建流程。' >&2
  exit 2
fi
node --test tests/*.test.js
mkdir -p build
if [ "$mode" = unsigned ]; then
  xcodebuild -project Zhixing.xcodeproj -scheme Zhixing -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath build/DerivedData \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' build
  app_path='build/DerivedData/Build/Products/Release-iphoneos/Zhixing.app'
  test -f "$app_path/Zhixing"
  file "$app_path/Zhixing" | tee build/binary-info.txt
  file "$app_path/Zhixing" | grep -q 'Mach-O'
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist"
  rm -rf build/Payload
  mkdir -p build/Payload
  ditto "$app_path" build/Payload/Zhixing.app
  (cd build && /usr/bin/zip -q -r ZhixingShike-unsigned.ipa Payload)
  unzip -t build/ZhixingShike-unsigned.ipa
  shasum -a 256 build/ZhixingShike-unsigned.ipa > build/SHA256SUMS.txt
  echo '已生成真实 arm64 设备构建。IPA 尚未签名，安装前需用自己的合法签名方式重新签名。'
elif [ "$mode" = signed ]; then
  : "${DEVELOPMENT_TEAM:?请先设置你的 Apple Team ID（不要在聊天中发送私钥）}"
  : "${EXPORT_OPTIONS_PLIST:?请指向本机的真实 ExportOptions.plist}"
  xcodebuild -project Zhixing.xcodeproj -scheme Zhixing -configuration Release \
    -destination 'generic/platform=iOS' -archivePath build/Zhixing.xcarchive \
    DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" -allowProvisioningUpdates archive
  xcodebuild -exportArchive -archivePath build/Zhixing.xcarchive \
    -exportPath build/signed -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" -allowProvisioningUpdates
else
  echo '用法：bash scripts/build-ios.sh unsigned|signed' >&2; exit 2
fi
