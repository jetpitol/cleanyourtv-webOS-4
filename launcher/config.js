window.CONFIG = {
  columns: 5,
  // Top row; reorder on the TV by holding OK on a tile.
  dockApps: ["youtube.leanback.v4", "netflix", "com.apple.appletv", "com.fpt.fptplay", "vieplay.vn"],
  // true for launcher-only installs (no Home Helper); false when the helper is installed.
  noHelper: false,
  // webOS 4 helper (install-windows.sh --webos4): never auto-launch it from here (a relaunch while it runs
  // stalls every app launch); its startup service starts it once per boot and reports whether it is alive.
  helperStatus: "service",
  // Photo backdrops (see wallpapers/CREDITS.txt), one picked at random on every return to Home.
  // Remove them all to get the per-app colour glow back.
  wallpapers: [
    "wallpapers/aerial-01.jpg", "wallpapers/aerial-02.jpg", "wallpapers/aerial-03.jpg", "wallpapers/aerial-04.jpg",
    "wallpapers/aerial-05.jpg", "wallpapers/aerial-06.jpg", "wallpapers/aerial-07.jpg", "wallpapers/aerial-08.jpg"
  ],
  // Display names for apps and inputs whose TV-supplied names are not English.
  titles: {
    "com.vtvgotv.app": "VTVGo",
    "com.webos.app.btspeakerapp": "Bluetooth Audio",
    "com.webos.app.hdmi2": "HDMI 2 · Set-top Box"
  },
  // Live TV stays reachable from the Inputs menu even though its tile is hidden.
  liveTvApp: "com.webos.app.livetv",
  // Hiding only removes the tile from this launcher; nothing is uninstalled. Delete an id to show it again.
  hiddenApps: [
    "com.gathin.tvhome", "com.local.nativehome",
    // LG stock apps (ids that are not on this TV are ignored)
    "com.webos.app.livetv", "com.webos.app.lgchannels", "com.webos.app.notificationcenter",
    "com.webos.app.sports", "com.webos.app.music", "com.webos.app.photovideo", "com.webos.app.mediadiscovery",
    "com.webos.app.homeconnect", "com.webos.app.iot-thirdparty-login", "com.webos.app.connectionwizard",
    "com.webos.app.familycare", "com.webos.app.tvuserguide", "com.webos.app.customersupport",
    "com.webos.app.self-diagnosis", "com.webos.app.remoteservice", "com.webos.app.artgallery",
    "com.webos.app.gallery", "com.webos.app.camera", "com.webos.app.browser",
    // webOS 4 (49UK6340) stock apps and promotions
    "tv.amasian.webos.vn1.channels", "webos.day", "com.webos.app.recordings", "com.webos.app.scheduler",
    "com.webos.app.livemenu", "com.webos.app.accessibility",
    // Input tiles: inputs are listed under Inputs instead
    "com.webos.app.hdmi1", "com.webos.app.hdmi2", "com.webos.app.hdmi3", "com.webos.app.hdmi4",
    "com.webos.app.externalinput.av1", "com.webos.app.externalinput.component"
  ]
};
