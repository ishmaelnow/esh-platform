package com.esh.driver;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Driver-only session persistence. Never logs tokens or resets a vault on read failure. */
@CapacitorPlugin(name = "DriverSessionStorage")
public class DriverSessionStoragePlugin extends Plugin {
    private static final String ALIAS = "esh.driver.session.v1";
    private static final String PREFS = "esh_driver_session";

    private String key(PluginCall call) {
        android.net.Uri page = android.net.Uri.parse(getBridge().getServerUrl());
        if (!"https".equals(page.getScheme()) || !"driver.eshapp.com".equals(page.getHost())) {
            throw new IllegalArgumentException("Untrusted session origin");
        }
        String key = call.getString("key");
        if (!"esh-driver-portal-auth".equals(key) && !"esh-driver-portal-auth-code-verifier".equals(key)) {
            throw new IllegalArgumentException("Unsupported session key");
        }
        return key;
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey secret(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("Session key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    @PluginMethod public synchronized void get(PluginCall call) {
        try {
            String key = key(call);
            String stored = preferences().getString(key, null);
            JSObject result = new JSObject();
            if (stored == null) { result.put("value", org.json.JSONObject.NULL); call.resolve(result); return; }
            String[] pieces = stored.split(":", 2);
            if (pieces.length != 2) throw new IllegalStateException("Invalid session data");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secret(false),
                new GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP)));
            cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            result.put("value", new String(cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception ignored) { call.reject("Saved sign-in could not be read. Retry or sign out explicitly."); }
    }

    @PluginMethod public synchronized void set(PluginCall call) {
        try {
            String key = key(call);
            String value = call.getString("value");
            if (value == null || value.length() > 200000) throw new IllegalArgumentException("Invalid session");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secret(true));
            cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!preferences().edit().putString(key, encrypted).commit()) throw new IllegalStateException("Save failed");
            call.resolve();
        } catch (Exception ignored) { call.reject("Sign-in could not be saved on this device."); }
    }

    @PluginMethod public synchronized void remove(PluginCall call) {
        try {
            if (!preferences().edit().remove(key(call)).commit()) throw new IllegalStateException("Remove failed");
            call.resolve();
        } catch (Exception ignored) { call.reject("Saved sign-in could not be removed."); }
    }
}
