package dev.bendmobile;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class BendActivity extends Activity {
    private WebView engine;
    private LinearLayout content;
    private boolean closed;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));
        scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(scroll);
        // Headless platform JS engine; every visible control is an Android View.
        engine = new WebView(this);
        engine.getSettings().setJavaScriptEnabled(true);
        engine.getSettings().setAllowFileAccess(false);
        engine.getSettings().setAllowContentAccess(false);
        engine.getSettings().setBlockNetworkLoads(true);
        engine.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (closed) return;
                try (InputStream input = getAssets().open("app.js")) {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int size;
                    while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size);
                    String source = new String(output.toByteArray(), StandardCharsets.UTF_8);
                    evaluate("(function(){try{" + source + ";return BendMobile.render();}"
                        + "catch(e){return JSON.stringify({error:String(e)});}})()");
                } catch (Exception error) { showError(error.toString()); }
            }
        });
        engine.loadDataWithBaseURL("https://bend.invalid/", "<!doctype html><html></html>", "text/html", "UTF-8", null);
    }

    private void evaluate(String script) {
        engine.evaluateJavascript(script, result -> {
            if (closed) return;
            try {
                Object decoded = new JSONTokener(result).nextValue();
                if (!(decoded instanceof String)) throw new IllegalStateException("Bend returned no frame");
                JSONObject frame = new JSONObject((String) decoded);
                if (frame.has("error")) throw new IllegalStateException(frame.getString("error"));
                View rendered = render(frame.getJSONObject("tree"));
                content.removeAllViews();
                content.addView(rendered);
            } catch (Exception error) { showError(error.toString()); }
        });
    }

    private View render(JSONObject node) throws Exception {
        String kind = node.getString("kind");
        switch (kind) {
            case "Text": {
                TextView text = new TextView(this);
                text.setText(node.getString("text"));
                text.setTextSize(18);
                return text;
            }
            case "Button": {
                Button button = new Button(this);
                button.setText(node.getString("text"));
                button.setAllCaps(false);
                button.setMinHeight(dp(48));
                String action = node.getString("action");
                button.setOnClickListener(view -> evaluate("BendMobile.dispatch(" + JSONObject.quote(action) + ")"));
                return button;
            }
            case "Column":
            case "Row": {
                boolean row = kind.equals("Row");
                LinearLayout stack = new LinearLayout(this);
                stack.setOrientation(row ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
                JSONArray children = node.getJSONArray("children");
                for (int i = 0; i < children.length(); i++) {
                    LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(
                        row ? 0 : LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
                        row ? 1 : 0);
                    if (i > 0) {
                        if (row) layout.setMarginStart(dp(12));
                        else layout.topMargin = dp(12);
                    }
                    stack.addView(render(children.getJSONObject(i)), layout);
                }
                return stack;
            }
            default: throw new IllegalArgumentException("Unknown view: " + kind);
        }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void showError(String error) {
        content.removeAllViews();
        TextView label = new TextView(this);
        label.setText("Unable to render app: " + error);
        content.addView(label);
    }

    @Override protected void onDestroy() {
        closed = true;
        if (engine != null) engine.destroy();
        super.onDestroy();
    }
}
