# AlphaSho models

Place an exported model at:

```text
models/alphasho-mobile.onnx
models/alphasho-mobile.json
```

The application loads the model lazily only when **AlphaSho** is selected. A user can also select an ONNX file from the UI; that model is stored in IndexedDB on the device. Model binaries are intentionally not committed to this repository.
