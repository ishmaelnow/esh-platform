package com.esh.driver;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "EmbeddedNavigation")
public class EmbeddedNavigationPlugin extends Plugin {
    @PluginMethod
    public void startNavigation(PluginCall call) {
        double latitude = call.getDouble("latitude", Double.NaN);
        double longitude = call.getDouble("longitude", Double.NaN);
        String label = call.getString("label", "ESH destination");
        String accessToken = call.getString("accessToken", "");
        if (Double.isNaN(latitude) || Double.isNaN(longitude) || accessToken == null || accessToken.isBlank()) {
            call.reject("A valid destination and Mapbox public token are required");
            return;
        }

        getActivity().runOnUiThread(() -> {
            getActivity().startActivity(EmbeddedNavigationActivity.intent(
                getActivity(), latitude, longitude, label, accessToken
            ));
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        });
    }
}
