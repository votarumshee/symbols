import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// Shared native contract: JSON map in Keychain, never Preferences/UserDefaults.
import Security
@objc(SymbolsVaultPlugin)
public class SymbolsVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SymbolsVaultPlugin"
    public let jsName = "SymbolsVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise)
    ]
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.votarumshee.symbols.vault.v1", kSecAttrAccount as String: "accounts",
        kSecAttrSynchronizable as String: false] }
    @objc func read(_ call: CAPPluginCall) {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": "{}"]); return }
        guard status == errSecSuccess, let data = result as? Data, let text = String(data: data, encoding: .utf8) else {
            call.reject("Не удалось открыть защищённое хранилище. Восстановите вход по коду.", "VAULT_RECOVERY_REQUIRED"); return
        }
        call.resolve(["value": text])
    }
    private func save(_ value: String) -> OSStatus {
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if update != errSecItemNotFound { return update }
        var item = query; attributes.forEach { item[$0.key] = $0.value }; return SecItemAdd(item as CFDictionary, nil)
    }
    @objc func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), value.utf8.count <= 2_000_000,
              (try? JSONSerialization.jsonObject(with: Data(value.utf8))) is [String: Any] else {
            call.reject("Недопустимые данные аккаунта", "VAULT_WRITE_FAILED"); return
        }
        guard save(value) == errSecSuccess else { call.reject("Не удалось сохранить аккаунт", "VAULT_WRITE_FAILED"); return }; call.resolve()
    }
    @objc func reset(_ call: CAPPluginCall) {
        guard call.getBool("confirm") == true else { call.reject("Требуется подтверждение восстановления"); return }
        // Rename the old Keychain item to preserve recoverable data before creating an empty vault.
        let archived: [String: Any] = [kSecAttrAccount as String: "recovery-" + UUID().uuidString]
        let status = SecItemUpdate(query as CFDictionary, archived as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Не удалось начать восстановление", "VAULT_RECOVERY_REQUIRED"); return
        }
        guard save("{}") == errSecSuccess else { call.reject("Не удалось начать восстановление", "VAULT_RECOVERY_REQUIRED"); return }; call.resolve()
    }
}
class SymbolsBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(SymbolsVaultPlugin()) }
}
