# Compile-only ErrorProne annotation, not executed by Android tests.
-dontwarn javax.lang.model.element.Modifier
-keep class com.votarumshee.symbols.webpreview.MigrationAcceptanceTest { *; }
