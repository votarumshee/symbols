import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
}
fun setting(name: String) = providers.gradleProperty(name).orElse(providers.environmentVariable(name)).orElse("").get()
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
android {
    namespace = "com.votarumshee.symbols"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    defaultConfig {
        applicationId = "com.votarumshee.symbols"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "PRIVACY_URL", quoted(setting("SYMBOLS_PRIVACY_URL")))
        buildConfigField("String", "SUPPORT_URL", quoted(setting("SYMBOLS_SUPPORT_URL")))
    }
    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            buildConfigField("String", "API_URL", quoted(setting("SYMBOLS_DEV_URL").ifBlank { "http://10.0.2.2:8080" }))
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            buildConfigField("String", "API_URL", quoted(setting("SYMBOLS_STAGING_URL")))
        }
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "API_URL", quoted(setting("SYMBOLS_PROD_URL")))
        }
    }
    signingConfigs {
        if (setting("SYMBOLS_KEYSTORE").isNotBlank()) create("owner") {
            storeFile = file(setting("SYMBOLS_KEYSTORE"))
            storePassword = setting("SYMBOLS_STORE_PASSWORD")
            keyAlias = setting("SYMBOLS_KEY_ALIAS")
            keyPassword = setting("SYMBOLS_KEY_PASSWORD")
        }
    }
    buildTypes {
        debug { }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("owner")
        }
        create("qa") {
            initWith(getByName("release"))
            applicationIdSuffix = ".qa"
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += "release"
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }
    packaging { resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1") }
    lint { abortOnError = true; checkReleaseBuilds = true }
}
kotlin { jvmToolchain(21) }
// A release must not silently embed a guessed domain or an insecure test endpoint.
tasks.configureEach {
    if (name == "preProdReleaseBuild" || name == "preStagingReleaseBuild" || name == "preDevReleaseBuild") doFirst {
        val environment = when { name.contains("Prod") -> "PROD"; name.contains("Staging") -> "STAGING"; else -> "DEV" }
        val url = setting("SYMBOLS_${environment}_URL")
        require(url.startsWith("https://") && URI(url).host != null) { "Set SYMBOLS_${environment}_URL to a real HTTPS Server v3 endpoint" }
    }
}
dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.lifecycle.runtime)
    implementation(libs.lifecycle.process)
    implementation(libs.datastore)
    implementation(libs.coroutines.android)
    implementation(libs.androidsvg)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test)
    androidTestImplementation(libs.android.test.runner)
    androidTestImplementation(libs.android.test.junit)
    debugImplementation(libs.compose.test.manifest)
}
