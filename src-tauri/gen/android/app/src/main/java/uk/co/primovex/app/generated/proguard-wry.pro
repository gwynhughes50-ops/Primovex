# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class uk.co.primovex.app.* {
  native <methods>;
}

-keep class uk.co.primovex.app.WryActivity {
  public <init>(...);

  void setWebView(uk.co.primovex.app.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class uk.co.primovex.app.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class uk.co.primovex.app.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class uk.co.primovex.app.RustWebChromeClient,uk.co.primovex.app.RustWebViewClient {
  public <init>(...);
}
