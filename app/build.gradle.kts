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
        versionCode = 10
        versionName = "0.4.0"
    }

    signingConfigs {
        getByName("debug") {
            enableV1Signing = true
            enableV2Signing = true
        }
        create("stable") {
            val signingPath = System.getenv("WORKCLOCK_SIGNING_FILE")
            val signingPassword = System.getenv("WORKCLOCK_SIGNING_PASSWORD")
            if (!signingPath.isNullOrBlank() && !signingPassword.isNullOrBlank()) {
                storeFile = file(signingPath)
                storePassword = signingPassword
                keyAlias = "workclock"
                keyPassword = signingPassword
            }
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
            signingConfig = signingConfigs.getByName("stable")
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