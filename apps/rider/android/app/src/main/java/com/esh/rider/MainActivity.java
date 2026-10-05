package com.esh.rider;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RiderSessionStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
