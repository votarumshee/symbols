plugins { alias(libs.plugins.kotlin.jvm); alias(libs.plugins.kotlin.serialization) }
kotlin { jvmToolchain(21) }
dependencies {
    api(libs.serialization)
    api(libs.coroutines)
    implementation(libs.ktor.core)
    implementation(libs.ktor.okhttp)
    implementation(libs.ktor.websockets)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.ktor.mock)
}
tasks.test {
    systemProperty("contracts.dir", rootProject.file("../contracts").absolutePath)
    systemProperty("symbols.integrationUrl", providers.environmentVariable("SYMBOLS_TEST_URL").orElse("").get())
}
