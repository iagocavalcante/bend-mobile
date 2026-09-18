package dev.bendmobile;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.window.OnBackInvokedDispatcher;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.text.Editable;
import android.text.TextWatcher;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class BendActivity extends Activity {
    private WebView engine;
    private LinearLayout content;
    private TextView status;
    private boolean closed, busy, patching, canGoBack;
    private final ArrayDeque<Runnable> commands = new ArrayDeque<>();
    private final HashMap<String, View> views = new HashMap<>();
    private final HashMap<String, JSONObject> nodes = new HashMap<>();
    private final HashSet<String> seen = new HashSet<>();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));
        content.setFocusableInTouchMode(true);
        status = new TextView(this);
        scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(scroll);
        engine = new WebView(this);
        engine.getSettings().setJavaScriptEnabled(true);
        engine.getSettings().setAllowFileAccess(false);
        engine.getSettings().setAllowContentAccess(false);
        engine.getSettings().setBlockNetworkLoads(true);
        engine.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
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
                    String saved = getSharedPreferences("bend", MODE_PRIVATE).getString("snapshot", null);
                    enqueue(() -> evaluate("(function(){try{" + source + ";return BendMobile.start("
                        + (saved == null ? "null" : JSONObject.quote(saved))
                        + ");}catch(e){return JSON.stringify({error:String(e)});}})()", null));
                } catch (Exception error) { showError(error.toString()); }
            }
        });
        engine.loadDataWithBaseURL("https://bend.invalid/", "<!doctype html><html></html>", "text/html", "UTF-8", null);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void enqueue(Runnable action) {
        if (closed) return;
        commands.add(action);
        if (!busy) next();
    }

    private void next() {
        busy = !commands.isEmpty();
        if (busy && !closed) commands.remove().run();
    }

    private void send(String event, String action, String value) {
        enqueue(() -> evaluate(script(event, action, value), null));
    }

    private String script(String event, String action, String value) {
        return "BendMobile.send(" + JSONObject.quote(event) + "," + JSONObject.quote(action) + "," + JSONObject.quote(value) + ")";
    }

    private void evaluate(String script, String success) {
        engine.evaluateJavascript(script, result -> {
            if (closed) return;
            try {
                Object decoded = new JSONTokener(result).nextValue();
                if (!(decoded instanceof String)) throw new IllegalStateException("Bend returned no frame");
                JSONObject frame = new JSONObject((String) decoded);
                if (frame.has("error")) throw new IllegalStateException(frame.getString("error"));
                JSONObject tree = frame.getJSONObject("tree");
                String snapshot = frame.getString("snapshot");
                if (snapshot.length() > 262144) throw new IllegalStateException("Snapshot exceeds limit");
                // Commit small snapshots synchronously; do not acknowledge an unsaved edit.
                android.content.SharedPreferences preferences = getSharedPreferences("bend", MODE_PRIVATE);
                String previous = preferences.getString("snapshot", null);
                if (!preferences.edit().putString("snapshot", snapshot).commit()) {
                    preferences.edit().putString("snapshot", previous).commit();
                    throw new IllegalStateException("Cannot save state; edit was not committed");
                }
                engine.evaluateJavascript("BendMobile.commit();true", committed -> {
                    if (closed) return;
                    try {
                        if (!"true".equals(committed)) throw new IllegalStateException("Cannot commit Bend state");
                        seen.clear();
                        patching = true;
                        View rendered = render(tree);
                        reconcile(content, new View[]{rendered, status}, false);
                        views.keySet().retainAll(seen);
                        nodes.keySet().retainAll(seen);
                        canGoBack = frame.optBoolean("canGoBack");
                        if (success != null) status.setText(success);
                    } catch (Exception error) { showError(error.toString()); }
                    finally { patching = false; next(); }
                });
            } catch (Exception error) {
                engine.evaluateJavascript("BendMobile.abort()", ignored -> {
                    if (!closed) { showError(error.toString()); next(); }
                });
            }
        });
    }

    private void reconcile(LinearLayout parent, View[] children, boolean row) {
        HashSet<View> desired = new HashSet<>(java.util.Arrays.asList(children));
        for (int i = parent.getChildCount() - 1; i >= 0; --i)
            if (!desired.contains(parent.getChildAt(i))) parent.removeViewAt(i);
        for (int i = 0; i < children.length; i++) {
            View child = children[i];
            if (parent.getChildCount() <= i || parent.getChildAt(i) != child) {
                if (child.getParent() != null) ((ViewGroup) child.getParent()).removeView(child);
                parent.addView(child, i);
            }
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(row ? 0 : -1, -2, row ? 1 : 0);
            if (i > 0) { if (row) layout.setMarginStart(dp(12)); else layout.topMargin = dp(12); }
            child.setLayoutParams(layout);
        }
    }

    private View render(JSONObject node) throws Exception {
        String id = node.getString("id"), kind = node.getString("kind");
        seen.add(id);
        nodes.put(id, node);
        View old = views.get(id), result;
        switch (kind) {
            case "Text": {
                TextView text = old != null && old.getClass() == TextView.class ? (TextView) old : new TextView(this);
                text.setText(node.getString("text"));
                text.setTextSize(18);
                result = text;
                break;
            }
            case "Input": {
                EditText field;
                if (old instanceof EditText) field = (EditText) old;
                else {
                    field = new EditText(this);
                    field.setSingleLine(true);
                    field.setMinHeight(dp(48));
                    field.addTextChangedListener(new TextWatcher() {
                        public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
                        public void onTextChanged(CharSequence s, int start, int before, int count) {}
                        public void afterTextChanged(Editable value) {
                            JSONObject latest = nodes.get(id);
                            if (!patching && latest != null) send("input", latest.optString("action"), value.toString());
                        }
                    });
                }
                field.setHint(node.getString("text"));
                field.setContentDescription(node.getString("text"));
                String value = node.getString("value");
                // Preserve native selection, local edits and composing spans while focused.
                if (!field.hasFocus() && !field.getText().toString().equals(value)) field.setText(value);
                result = field;
                break;
            }
            case "Button":
            case "Compute": {
                Button button = old instanceof Button ? (Button) old : new Button(this);
                button.setText(node.getString("text"));
                button.setAllCaps(false);
                button.setMinHeight(dp(48));
                button.setEnabled(!node.optBoolean("disabled"));
                button.setOnClickListener(view -> activate(id));
                result = button;
                break;
            }
            case "Column":
            case "Row": {
                boolean row = kind.equals("Row");
                LinearLayout stack = old instanceof LinearLayout ? (LinearLayout) old : new LinearLayout(this);
                stack.setOrientation(row ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
                JSONArray children = node.getJSONArray("children");
                View[] rendered = new View[children.length()];
                for (int i = 0; i < children.length(); i++) rendered[i] = render(children.getJSONObject(i));
                reconcile(stack, rendered, row);
                result = stack;
                break;
            }
            default: throw new IllegalArgumentException("Unknown view: " + kind);
        }
        views.put(id, result);
        return result;
    }

    private void activate(String id) {
        JSONObject node = nodes.get(id);
        if (node == null) return;
        if (!node.optString("kind").equals("Compute")) {
            send(node.optString("event"), node.optString("action"), "");
            return;
        }
        enqueue(() -> {
            if (!nodes.containsKey(id) || !nodes.get(id).optString("kind").equals("Compute")) { next(); return; }
            try {
                JSONArray values = node.getJSONArray("input");
                long[] input = new long[values.length()];
                for (int i = 0; i < input.length; i++) input[i] = values.getLong(i);
                boolean gpu = node.getString("backend").equals("gpu");
                String backend = gpu ? "GPU" : "CPU";
                status.setText("Running " + backend + "…");
                worker.execute(() -> {
                    try {
                        long[] output = NativeCompute.run(input, gpu, getAssets());
                        String payload = new JSONArray(output).toString();
                        runOnUiThread(() -> {
                            if (!closed) evaluate(script("result", node.optString("action"), payload), backend + " complete");
                        });
                    } catch (Exception | LinkageError error) {
                        runOnUiThread(() -> { if (!closed) { showError(error.toString()); next(); } });
                    }
                });
            } catch (Exception error) { showError(error.toString()); next(); }
        });
    }

    @Override public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        enqueue(() -> {
            if (canGoBack) evaluate(script("back", "", ""), null);
            else { finish(); next(); }
        });
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void showError(String error) {
        status.setText(error);
        if (status.getParent() == null) content.addView(status);
    }
    @Override protected void onDestroy() {
        closed = true;
        commands.clear();
        worker.shutdown();
        if (engine != null) engine.destroy();
        super.onDestroy();
    }
}
