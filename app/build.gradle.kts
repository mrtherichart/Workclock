plugins {
    id("com.android.application")
}

android {
    namespace = "nl.workclock.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "nl.workclock.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.1.2"
    }

    signingConfigs {
        getByName("debug") {
            // Keep the newer v2 signature and include v1 for older installers.
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
        getByName("debug") {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("com.google.android.gms:play-services-location:21.4.0")
}