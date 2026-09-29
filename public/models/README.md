# UD parser model (not bundled)

The grading view's grammar-range panel uses `udpipe-wasm` and the English UD model. The model is
CC BY-NC-SA (UD 2.5), so it is not committed or shipped in the build. To enable the panel,
download it for non-commercial use and place it here:

    curl -L -o public/models/english-ewt.udpipe \
      https://raw.githubusercontent.com/jwijffels/udpipe.models.ud.2.5/master/inst/udpipe-ud-2.5-191206/english-ewt-ud-2.5-191206.udpipe

Without the file the panel stays hidden and the compromise-based profile is used.
