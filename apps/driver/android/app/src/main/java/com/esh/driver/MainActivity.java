package com.esh.driver;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public MainActivity() {
        registerPlugin(EmbeddedNavigationPlugin.class);
    }
}
