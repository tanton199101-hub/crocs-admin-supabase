(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsRegional = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const STORAGE_KEY = 'crocs-region-v1';
  const COUNTRY_KEY = 'crocs-country-v1';
  const CURRENCIES = {
    GBP: { name: 'British Pound', symbol: '£', locale: 'en-GB', decimals: 2 },
    USD: { name: 'US Dollar', symbol: '$', locale: 'en-US', decimals: 2 },
    EUR: { name: 'Euro', symbol: '€', locale: 'de-DE', decimals: 2 },
    VND: { name: 'Vietnamese Dong', symbol: '₫', locale: 'vi-VN', decimals: 0 },
    JPY: { name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP', decimals: 0 },
    AUD: { name: 'Australian Dollar', symbol: 'A$', locale: 'en-AU', decimals: 2 },
    CAD: { name: 'Canadian Dollar', symbol: 'CA$', locale: 'en-CA', decimals: 2 },
    SGD: { name: 'Singapore Dollar', symbol: 'S$', locale: 'en-SG', decimals: 2 },
  };
  const LANGUAGES = {
    en: { name: 'English', nativeName: 'English', locale: 'en-GB' },
    vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt', locale: 'vi-VN' },
    fr: { name: 'French', nativeName: 'Français', locale: 'fr-FR' },
    de: { name: 'German', nativeName: 'Deutsch', locale: 'de-DE' },
    ja: { name: 'Japanese', nativeName: '日本語', locale: 'ja-JP' },
    ko: { name: 'Korean', nativeName: '한국어', locale: 'ko-KR' },
  };
  const DEFAULT_REGIONS = [
    { id: 'gb', name: 'United Kingdom', countries: ['GB', 'UK'], language: 'en', locale: 'en-GB', currency: 'GBP', exchangeRate: 1, priceMultiplier: 1, priceOverrides: {} },
    { id: 'us', name: 'United States', countries: ['US'], language: 'en', locale: 'en-US', currency: 'USD', exchangeRate: 1.27, priceMultiplier: 1, priceOverrides: {} },
    { id: 'eu', name: 'European Union', countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'], language: 'en', locale: 'en-IE', currency: 'EUR', exchangeRate: 1.17, priceMultiplier: 1, priceOverrides: {} },
    { id: 'vn', name: 'Vietnam', countries: ['VN'], language: 'vi', locale: 'vi-VN', currency: 'VND', exchangeRate: 31500, priceMultiplier: 1, priceOverrides: {} },
    { id: 'au', name: 'Australia', countries: ['AU'], language: 'en', locale: 'en-AU', currency: 'AUD', exchangeRate: 1.95, priceMultiplier: 1, priceOverrides: {} },
  ];
  const DEFAULT_LANGUAGES = {
    en: { ...LANGUAGES.en, enabled: true },
    vi: { ...LANGUAGES.vi, enabled: true },
    fr: { ...LANGUAGES.fr, enabled: false },
    de: { ...LANGUAGES.de, enabled: false },
    ja: { ...LANGUAGES.ja, enabled: false },
    ko: { ...LANGUAGES.ko, enabled: false },
  };
  const DICTIONARY = {
    en: { search: 'Search', close: 'Close', menu: 'Menu', bag: 'Your bag', account: 'Log in', emptyBag: 'Your bag is empty', findPair: 'Find a pair that feels like you.', shopClassics: 'Shop classics', subtotal: 'Subtotal', checkout: 'Checkout', addToBag: 'Add to bag', chooseOptions: 'Choose options', newArrivals: 'New arrivals', shopNow: 'Shop Now!', shopCollection: 'Shop the Collection', language: 'Language', region: 'Region', delivery: 'Delivery', standardDelivery: 'Standard delivery', expressDelivery: 'Express delivery', total: 'Total', remove: 'Remove', quantity: 'Quantity', home: 'Home', productDetails: 'Product details', selected: 'Selected', availability: 'Availability', selectSize: 'Select your size', outOfStock: 'Out of stock', continueShopping: 'Continue shopping', secureCheckout: 'Secure checkout', contactDetails: 'Contact details', fullName: 'Full name', emailAddress: 'Email address', address: 'Address', city: 'Town or city', postcode: 'Postcode', placeOrder: 'Place demo order', saveChanges: 'Save changes', from: 'From', sale: 'Sale', women: 'Women', men: 'Men', kids: 'Kids', charms: 'Jibbitz™ Charms', work: 'Crocs at Work™', accessories: 'Bags & Accessories', collaborations: 'Collaborations', classicIcons: 'Explore Our Classic Icons', shopClassicClogs: 'Shop all classic clogs', softness: 'Softness, switched on', killingSoftly: 'Killing It Softly', shopCozzy: 'Shop Cozzzy Slipper', styleYourWay: 'Style it your way', shoeTattoos: 'Shoe Tattoos', clubTitle: 'Join Crocs Club & get 15% off your next purchase', clubCopy: 'Sign up for first access to new drops, member-only offers and more.', signUp: 'Sign up for free', detectedRegion: 'Prices shown for your region', regionHelp: 'Detected from your IP. You can change this anytime.' },
    vi: { search: 'Tìm kiếm', close: 'Đóng', menu: 'Menu', bag: 'Túi hàng', account: 'Đăng nhập', emptyBag: 'Túi hàng đang trống', findPair: 'Tìm một đôi giày đúng với bạn.', shopClassics: 'Mua dòng Classic', subtotal: 'Tạm tính', checkout: 'Thanh toán', addToBag: 'Thêm vào túi', chooseOptions: 'Chọn tuỳ chọn', newArrivals: 'Hàng mới về', shopNow: 'Mua ngay!', shopCollection: 'Mua bộ sưu tập', language: 'Ngôn ngữ', region: 'Khu vực', delivery: 'Giao hàng', standardDelivery: 'Giao tiêu chuẩn', expressDelivery: 'Giao nhanh', total: 'Tổng cộng', remove: 'Xoá', quantity: 'Số lượng', home: 'Trang chủ', productDetails: 'Chi tiết sản phẩm', selected: 'Đã chọn', availability: 'Tình trạng', selectSize: 'Chọn kích cỡ', outOfStock: 'Hết hàng', continueShopping: 'Tiếp tục mua sắm', secureCheckout: 'Thanh toán bảo mật', contactDetails: 'Thông tin liên hệ', fullName: 'Họ và tên', emailAddress: 'Địa chỉ email', address: 'Địa chỉ', city: 'Tỉnh/thành phố', postcode: 'Mã bưu chính', placeOrder: 'Đặt đơn demo', saveChanges: 'Lưu đơn', from: 'Từ', sale: 'Giảm giá', women: 'Nữ', men: 'Nam', kids: 'Trẻ em', charms: 'Jibbitz™ Charms', work: 'Crocs at Work™', accessories: 'Túi & phụ kiện', collaborations: 'Hợp tác', classicIcons: 'Khám phá các biểu tượng Classic', shopClassicClogs: 'Mua toàn bộ Classic Clog', softness: 'Bật chế độ mềm mại', killingSoftly: 'Êm như mây', shopCozzy: 'Mua Cozzzy Slipper', styleYourWay: 'Tạo phong cách riêng', shoeTattoos: 'Hình xăm giày', clubTitle: 'Tham gia Crocs Club & giảm 15% cho lần mua tiếp theo', clubCopy: 'Đăng ký để nhận thông tin sản phẩm mới và ưu đãi dành riêng cho thành viên.', signUp: 'Đăng ký miễn phí', detectedRegion: 'Giá dành cho khu vực của bạn', regionHelp: 'Khu vực được nhận diện theo IP. Bạn có thể đổi bất cứ lúc nào.' },
    fr: { search: 'Rechercher', close: 'Fermer', menu: 'Menu', bag: 'Votre panier', account: 'Connexion', emptyBag: 'Votre panier est vide', findPair: 'Trouvez la paire qui vous ressemble.', shopClassics: 'Voir les classiques', subtotal: 'Sous-total', checkout: 'Paiement', addToBag: 'Ajouter au panier', chooseOptions: 'Choisir les options', newArrivals: 'Nouveautés', shopNow: 'Acheter maintenant !', shopCollection: 'Découvrir la collection', language: 'Langue', region: 'Région', delivery: 'Livraison', standardDelivery: 'Livraison standard', expressDelivery: 'Livraison express', total: 'Total', remove: 'Supprimer', quantity: 'Quantité', home: 'Accueil', productDetails: 'Détails du produit', selectSize: 'Choisissez votre taille', outOfStock: 'Rupture de stock', continueShopping: 'Continuer vos achats', secureCheckout: 'Paiement sécurisé', contactDetails: 'Coordonnées', fullName: 'Nom complet', emailAddress: 'Adresse e-mail', address: 'Adresse', city: 'Ville', postcode: 'Code postal', placeOrder: 'Commander (démo)', saveChanges: 'Enregistrer', detectedRegion: 'Prix pour votre région', regionHelp: 'Région détectée par votre IP. Modifiable à tout moment.' },
    de: { search: 'Suchen', close: 'Schließen', menu: 'Menü', bag: 'Deine Tasche', account: 'Anmelden', emptyBag: 'Deine Tasche ist leer', findPair: 'Finde ein Paar, das zu dir passt.', shopClassics: 'Klassiker kaufen', subtotal: 'Zwischensumme', checkout: 'Kasse', addToBag: 'In die Tasche', chooseOptions: 'Optionen wählen', newArrivals: 'Neuheiten', shopNow: 'Jetzt shoppen!', shopCollection: 'Kollektion shoppen', language: 'Sprache', region: 'Region', delivery: 'Lieferung', standardDelivery: 'Standardversand', expressDelivery: 'Expressversand', total: 'Gesamt', remove: 'Entfernen', quantity: 'Menge', home: 'Startseite', productDetails: 'Produktdetails', selectSize: 'Größe wählen', outOfStock: 'Nicht vorrätig', continueShopping: 'Weiter einkaufen', secureCheckout: 'Sicher zur Kasse', contactDetails: 'Kontaktdaten', fullName: 'Vollständiger Name', emailAddress: 'E-Mail-Adresse', address: 'Adresse', city: 'Stadt', postcode: 'Postleitzahl', placeOrder: 'Demo-Bestellung aufgeben', saveChanges: 'Änderungen speichern', detectedRegion: 'Preise für deine Region', regionHelp: 'Per IP erkannt. Jederzeit änderbar.' },
  };

  Object.assign(DICTIONARY.en, { freeDelivery: 'Free standard delivery on orders over {amount}. This storefront is a demo; no payment is taken.', freeOver: 'Free over {amount}, otherwise {fee}.', redirectStripe: 'You will be redirected to Stripe to complete payment.', testMode: 'Test mode is active — no real charge will be made.', liveMode: 'Live mode is active.', paymentUnavailableCopy: 'The store is finishing its Stripe connection. No order or card payment will be created.', demoCheckout: 'Demo checkout', demoCheckoutCopy: 'No card details are requested, and no payment or shipment will be processed.', phoneOptional: 'Phone (optional)', reviewIntro: 'Review your details before placing this demo order.', secureIntro: 'Pay securely with Stripe Checkout. Your card details never touch this website.', paymentUnavailable: 'Payment unavailable', continuePayment: 'Continue to secure payment', demoOrder: 'Place demo order', orderReceived: 'Order received', demoOrderSaved: 'Your demo order', orderSaved: 'is saved.', orderTotal: 'The total is {amount}.', noPayment: 'No card payment or shipment has been processed.', returnStore: 'Return to the store', returnBag: 'Return to your bag', confirmingPayment: 'Confirming your payment', paymentReceived: 'Payment received', paymentCancelled: 'Payment cancelled', paymentPending: 'Payment confirmation pending', cancelledCopy: 'Your bag is still saved. No card was charged. You can review the details and try again when you are ready.', confirmingCopy: 'Stripe has returned you to the store. We are waiting for the signed payment confirmation before showing your order number.', orderConfirmed: 'Your order', confirmed: 'is confirmed', orderFor: 'for {amount}', stripeProcessed: 'Stripe has securely processed your payment.', paymentProcessing: 'Your payment is being confirmed by Stripe. We have saved your checkout and will update the order automatically.', paymentNeedsAttention: 'Payment needs attention', paymentNeedsAttentionCopy: 'Stripe could not confirm this payment yet. Please contact the store before trying again.', paymentPendingCopy: 'Stripe is still confirming your payment. Please check your email before paying again.', addedToBag: 'added to your bag', removedFromBag: 'removed from your bag', notAvailable: 'This pair is not available in the live catalogue yet.' });
  Object.assign(DICTIONARY.vi, { freeDelivery: 'Miễn phí giao tiêu chuẩn cho đơn từ {amount}. Đây là storefront demo; không thu tiền.', freeOver: 'Miễn phí từ {amount}, nếu không là {fee}.', redirectStripe: 'Bạn sẽ được chuyển tới Stripe để hoàn tất thanh toán.', testMode: 'Đang ở chế độ thử nghiệm — không thu tiền thật.', liveMode: 'Đang ở chế độ thanh toán thật.', paymentUnavailableCopy: 'Cửa hàng đang hoàn tất kết nối Stripe. Chưa tạo đơn hoặc thanh toán.', demoCheckout: 'Thanh toán demo', demoCheckoutCopy: 'Không yêu cầu thông tin thẻ và không xử lý thanh toán hoặc giao hàng.', phoneOptional: 'Số điện thoại (không bắt buộc)', reviewIntro: 'Kiểm tra thông tin trước khi đặt đơn demo.', secureIntro: 'Thanh toán bảo mật qua Stripe Checkout. Website không lưu thông tin thẻ.', paymentUnavailable: 'Thanh toán tạm thời không khả dụng', continuePayment: 'Tiếp tục thanh toán bảo mật', demoOrder: 'Đặt đơn demo', orderReceived: 'Đã nhận đơn', demoOrderSaved: 'Đơn demo', orderSaved: 'đã được lưu.', orderTotal: 'Tổng cộng là {amount}.', noPayment: 'Chưa thu tiền hoặc xử lý giao hàng.', returnStore: 'Về cửa hàng', returnBag: 'Về túi hàng', confirmingPayment: 'Đang xác nhận thanh toán', paymentReceived: 'Đã thanh toán', paymentCancelled: 'Đã huỷ thanh toán', paymentPending: 'Đang chờ xác nhận thanh toán', cancelledCopy: 'Túi hàng vẫn được giữ. Thẻ chưa bị trừ tiền. Bạn có thể xem lại và thử lại khi sẵn sàng.', confirmingCopy: 'Stripe đã đưa bạn về cửa hàng. Chúng tôi đang chờ xác nhận thanh toán để hiển thị mã đơn.', orderConfirmed: 'Đơn hàng', confirmed: 'đã được xác nhận', orderFor: 'với giá trị {amount}', stripeProcessed: 'Stripe đã xử lý thanh toán an toàn.', paymentProcessing: 'Thanh toán đang được Stripe xác nhận. Đơn của bạn đã được lưu và sẽ tự động cập nhật.', paymentNeedsAttention: 'Thanh toán cần kiểm tra', paymentNeedsAttentionCopy: 'Stripe chưa thể xác nhận thanh toán. Vui lòng liên hệ cửa hàng trước khi thử lại.', paymentPendingCopy: 'Stripe vẫn đang xác nhận thanh toán. Hãy kiểm tra email trước khi thanh toán lại.', addedToBag: 'đã được thêm vào túi', removedFromBag: 'đã được xoá khỏi túi', notAvailable: 'Sản phẩm này chưa có trong catalog trực tiếp.' });
  Object.assign(DICTIONARY.fr, { freeDelivery: 'Livraison standard offerte dès {amount}. Cette boutique est une démo ; aucun paiement ne sera effectué.', freeOver: 'Gratuit dès {amount}, sinon {fee}.', redirectStripe: 'Vous serez redirigé vers Stripe pour terminer le paiement.', testMode: 'Mode test actif — aucun débit réel.', liveMode: 'Mode réel actif.', paymentUnavailableCopy: 'La boutique termine sa connexion Stripe. Aucune commande ni paiement ne sera créé.', demoCheckout: 'Paiement démo', demoCheckoutCopy: 'Aucune donnée de carte ni livraison ne sera traitée.', phoneOptional: 'Téléphone (facultatif)', reviewIntro: 'Vérifiez vos informations avant de passer la commande démo.', secureIntro: 'Payez en toute sécurité avec Stripe Checkout. Vos données de carte ne touchent jamais ce site.', paymentUnavailable: 'Paiement indisponible', continuePayment: 'Continuer vers le paiement sécurisé', demoOrder: 'Passer la commande démo', orderReceived: 'Commande reçue', demoOrderSaved: 'Votre commande démo', orderSaved: 'est enregistrée.', orderTotal: 'Le total est de {amount}.', noPayment: 'Aucun paiement ni envoi n’a été traité.', returnStore: 'Retour à la boutique', returnBag: 'Retour au panier', confirmingPayment: 'Confirmation du paiement', paymentReceived: 'Paiement reçu', paymentCancelled: 'Paiement annulé', paymentPending: 'Confirmation du paiement en attente', cancelledCopy: 'Votre panier est conservé. Aucune carte n’a été débitée. Vous pouvez vérifier les détails et réessayer.', confirmingCopy: 'Stripe vous a renvoyé vers la boutique. Nous attendons la confirmation signée avant d’afficher le numéro de commande.', orderConfirmed: 'Votre commande', confirmed: 'est confirmée', orderFor: 'pour {amount}', stripeProcessed: 'Stripe a traité votre paiement en toute sécurité.', paymentProcessing: 'Votre paiement est confirmé par Stripe. Votre commande est enregistrée et sera mise à jour automatiquement.', paymentNeedsAttention: 'Paiement à vérifier', paymentNeedsAttentionCopy: 'Stripe ne peut pas encore confirmer ce paiement. Contactez la boutique avant de réessayer.', paymentPendingCopy: 'Stripe confirme encore le paiement. Vérifiez votre e-mail avant de payer à nouveau.' });
  Object.assign(DICTIONARY.de, { freeDelivery: 'Kostenloser Standardversand ab {amount}. Dieser Shop ist eine Demo; es wird keine Zahlung vorgenommen.', freeOver: 'Kostenlos ab {amount}, sonst {fee}.', redirectStripe: 'Du wirst zur Zahlung zu Stripe weitergeleitet.', testMode: 'Testmodus aktiv — keine echte Belastung.', liveMode: 'Live-Modus aktiv.', paymentUnavailableCopy: 'Der Shop stellt die Stripe-Verbindung fertig. Es wird keine Bestellung oder Zahlung erstellt.', demoCheckout: 'Demo-Kasse', demoCheckoutCopy: 'Es werden keine Kartendaten oder Lieferungen verarbeitet.', phoneOptional: 'Telefon (optional)', reviewIntro: 'Überprüfe deine Angaben vor der Demo-Bestellung.', secureIntro: 'Sicher bezahlen mit Stripe Checkout. Deine Kartendaten erreichen diese Website nie.', paymentUnavailable: 'Zahlung nicht verfügbar', continuePayment: 'Zur sicheren Zahlung', demoOrder: 'Demo-Bestellung aufgeben', orderReceived: 'Bestellung erhalten', demoOrderSaved: 'Deine Demo-Bestellung', orderSaved: 'wurde gespeichert.', orderTotal: 'Der Gesamtbetrag ist {amount}.', noPayment: 'Es wurde keine Zahlung oder Lieferung verarbeitet.', returnStore: 'Zum Shop', returnBag: 'Zurück zur Tasche', confirmingPayment: 'Zahlung wird bestätigt', paymentReceived: 'Zahlung erhalten', paymentCancelled: 'Zahlung abgebrochen', paymentPending: 'Zahlungsbestätigung steht aus', cancelledCopy: 'Deine Tasche bleibt gespeichert. Es wurde nichts abgebucht. Prüfe die Details und versuche es erneut.', confirmingCopy: 'Stripe hat dich zurück zum Shop geleitet. Wir warten auf die signierte Zahlungsbestätigung, bevor wir die Bestellnummer anzeigen.', orderConfirmed: 'Deine Bestellung', confirmed: 'ist bestätigt', orderFor: 'über {amount}', stripeProcessed: 'Stripe hat deine Zahlung sicher verarbeitet.', paymentProcessing: 'Deine Zahlung wird von Stripe bestätigt. Deine Bestellung ist gespeichert und wird automatisch aktualisiert.', paymentNeedsAttention: 'Zahlung benötigt Aufmerksamkeit', paymentNeedsAttentionCopy: 'Stripe konnte die Zahlung noch nicht bestätigen. Kontaktiere den Shop, bevor du es erneut versuchst.', paymentPendingCopy: 'Stripe bestätigt die Zahlung noch. Prüfe deine E-Mail, bevor du erneut zahlst.' });
  Object.assign(DICTIONARY.en, { securePaymentFooter: 'Payments are securely processed by Stripe when enabled.', openingStripe: 'Opening Stripe…', savingOrder: 'Saving demo order…' });
  Object.assign(DICTIONARY.vi, { securePaymentFooter: 'Thanh toán được xử lý an toàn qua Stripe khi được bật.', openingStripe: 'Đang mở Stripe…', savingOrder: 'Đang lưu đơn demo…' });
  DICTIONARY.ja = {
    search: '検索', close: '閉じる', menu: 'メニュー', bag: 'バッグ', account: 'ログイン', emptyBag: 'バッグは空です', findPair: 'あなたらしい一足を見つけよう。', shopClassics: 'クラシックを見る', subtotal: '小計', checkout: 'チェックアウト', addToBag: 'バッグに追加', chooseOptions: 'オプションを選択', newArrivals: '新着商品', shopNow: '今すぐ購入', shopCollection: 'コレクションを見る', language: '言語', region: '地域', delivery: '配送', standardDelivery: '通常配送', expressDelivery: 'お急ぎ便', total: '合計', remove: '削除', quantity: '数量', home: 'ホーム', productDetails: '商品詳細', selected: '選択中', availability: '在庫状況', selectSize: 'サイズを選択', outOfStock: '在庫切れ', continueShopping: '買い物を続ける', secureCheckout: '安全なチェックアウト', contactDetails: '連絡先', fullName: '氏名', emailAddress: 'メールアドレス', address: '住所', city: '市区町村', postcode: '郵便番号', placeOrder: 'デモ注文を確定', saveChanges: '変更を保存', from: '〜', sale: 'セール', women: 'ウィメンズ', men: 'メンズ', kids: 'キッズ', charms: 'Jibbitz™ チャーム', work: 'Crocs at Work™', accessories: 'バッグ＆アクセサリー', collaborations: 'コラボレーション', classicIcons: 'クラシックアイコンを見る', shopClassicClogs: 'クラシッククロッグを見る', softness: 'やわらかさをオン', killingSoftly: 'やさしい履き心地', shopCozzy: 'Cozzzy スリッパを見る', styleYourWay: '自分らしくスタイリング', shoeTattoos: 'シュータトゥー', clubTitle: 'Crocs Clubに参加して次回15%オフ', clubCopy: '新作や会員限定オファーをいち早く受け取ろう。', signUp: '無料登録', detectedRegion: '地域の価格を表示中', regionHelp: 'IPから検出した地域です。いつでも変更できます。'
  };
  DICTIONARY.ko = {
    search: '검색', close: '닫기', menu: '메뉴', bag: '가방', account: '로그인', emptyBag: '가방이 비어 있습니다', findPair: '나에게 꼭 맞는 한 켤레를 찾아보세요.', shopClassics: '클래식 보기', subtotal: '소계', checkout: '결제', addToBag: '가방에 담기', chooseOptions: '옵션 선택', newArrivals: '신상품', shopNow: '지금 쇼핑하기', shopCollection: '컬렉션 보기', language: '언어', region: '지역', delivery: '배송', standardDelivery: '일반 배송', expressDelivery: '빠른 배송', total: '합계', remove: '삭제', quantity: '수량', home: '홈', productDetails: '상품 상세', selected: '선택됨', availability: '재고', selectSize: '사이즈 선택', outOfStock: '품절', continueShopping: '쇼핑 계속하기', secureCheckout: '안전한 결제', contactDetails: '연락처', fullName: '이름', emailAddress: '이메일 주소', address: '주소', city: '도시', postcode: '우편번호', placeOrder: '데모 주문하기', saveChanges: '변경 사항 저장', from: '최저', sale: '세일', women: '여성', men: '남성', kids: '키즈', charms: 'Jibbitz™ 참', work: 'Crocs at Work™', accessories: '가방 및 액세서리', collaborations: '콜라보레이션', classicIcons: '클래식 아이콘 살펴보기', shopClassicClogs: '클래식 클로그 모두 보기', softness: '부드러움을 켜세요', killingSoftly: '부드러운 편안함', shopCozzy: 'Cozzzy 슬리퍼 쇼핑', styleYourWay: '나만의 스타일', shoeTattoos: '슈 타투', clubTitle: 'Crocs Club 가입하고 다음 구매 15% 할인', clubCopy: '신상품과 회원 전용 혜택을 가장 먼저 만나보세요.', signUp: '무료 가입', detectedRegion: '지역별 가격을 표시합니다', regionHelp: 'IP로 지역을 감지했습니다. 언제든 변경할 수 있습니다.'
  };
  const sharedCheckoutCopy = {
    freeDelivery: 'Free standard delivery on orders over {amount}. This storefront is a demo; no payment is taken.', freeOver: 'Free over {amount}, otherwise {fee}.', redirectStripe: 'You will be redirected to Stripe to complete payment.', testMode: 'Test mode is active — no real charge will be made.', liveMode: 'Live mode is active.', paymentUnavailableCopy: 'The store is finishing its Stripe connection. No order or card payment will be created.', demoCheckout: 'Demo checkout', demoCheckoutCopy: 'No card details are requested, and no payment or shipment will be processed.', phoneOptional: 'Phone (optional)', reviewIntro: 'Review your details before placing this demo order.', secureIntro: 'Pay securely with Stripe Checkout. Your card details never touch this website.', paymentUnavailable: 'Payment unavailable', continuePayment: 'Continue to secure payment', demoOrder: 'Place demo order', orderReceived: 'Order received', demoOrderSaved: 'Your demo order', orderSaved: 'is saved.', orderTotal: 'The total is {amount}.', noPayment: 'No card payment or shipment has been processed.', returnStore: 'Return to the store', returnBag: 'Return to your bag', confirmingPayment: 'Confirming your payment', paymentReceived: 'Payment received', paymentCancelled: 'Payment cancelled', paymentPending: 'Payment confirmation pending', cancelledCopy: 'Your bag is still saved. No card was charged. You can review the details and try again when you are ready.', confirmingCopy: 'Stripe has returned you to the store. We are waiting for the signed payment confirmation before showing your order number.', orderConfirmed: 'Your order', confirmed: 'is confirmed', orderFor: 'for {amount}', stripeProcessed: 'Stripe has securely processed your payment.', paymentProcessing: 'Your payment is being confirmed by Stripe. We have saved your checkout and will update the order automatically.', paymentNeedsAttention: 'Payment needs attention', paymentNeedsAttentionCopy: 'Stripe could not confirm this payment yet. Please contact the store before trying again.', paymentPendingCopy: 'Stripe is still confirming your payment. Please check your email before paying again.', addedToBag: 'added to your bag', removedFromBag: 'removed from your bag', notAvailable: 'This pair is not available in the live catalogue yet.'
  };
  Object.assign(DICTIONARY.ja, sharedCheckoutCopy, { freeDelivery: '{amount}以上のご注文は通常配送無料。このサイトはデモのため決済は行われません。', freeOver: '{amount}以上は送料無料。それ以外は{fee}。', secureIntro: 'Stripe Checkoutで安全にお支払いください。カード情報はこのサイトを経由しません。', paymentUnavailable: 'オンライン決済は利用できません', demoOrder: 'デモ注文を確定', orderReceived: '注文を受け付けました', orderTotal: '合計は{amount}です。', noPayment: '決済や発送は行われていません。', returnStore: 'ショップに戻る', returnBag: 'バッグに戻る', paymentReceived: 'お支払いを受け付けました' });
  Object.assign(DICTIONARY.ko, sharedCheckoutCopy, { freeDelivery: '{amount} 이상 주문 시 일반 배송 무료. 데모 스토어이므로 결제되지 않습니다.', freeOver: '{amount} 이상 무료, 그 외에는 {fee}입니다.', secureIntro: 'Stripe Checkout으로 안전하게 결제하세요. 카드 정보는 이 사이트에 전달되지 않습니다.', paymentUnavailable: '온라인 결제를 사용할 수 없습니다', demoOrder: '데모 주문하기', orderReceived: '주문이 접수되었습니다', orderTotal: '총액은 {amount}입니다.', noPayment: '결제나 배송은 처리되지 않았습니다.', returnStore: '스토어로 돌아가기', returnBag: '가방으로 돌아가기', paymentReceived: '결제가 완료되었습니다' });

  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeCode = value => String(value || '').trim().toUpperCase().slice(0, 3);
  const normalizeRegion = region => {
    const source = region || {};
    const language = String(source.language || 'en').toLowerCase();
    const currency = String(source.currency || 'GBP').toUpperCase();
    return {
      id: String(source.id || 'gb').trim().toLowerCase(),
      name: String(source.name || source.id || 'United Kingdom').trim(),
      countries: Array.isArray(source.countries) ? source.countries.map(safeCode).filter(Boolean) : [],
      language: LANGUAGES[language] ? language : 'en',
      locale: String(source.locale || LANGUAGES[language]?.locale || 'en-GB'),
      currency: CURRENCIES[currency] ? currency : 'GBP',
      exchangeRate: Number.isFinite(Number(source.exchangeRate ?? source.rate)) && Number(source.exchangeRate ?? source.rate) > 0 ? Number(source.exchangeRate ?? source.rate) : 1,
      priceMultiplier: Number.isFinite(Number(source.priceMultiplier)) && Number(source.priceMultiplier) > 0 ? Number(source.priceMultiplier) : 1,
      priceOverrides: source.priceOverrides && typeof source.priceOverrides === 'object' && !Array.isArray(source.priceOverrides) ? source.priceOverrides : {},
    };
  };
  function normalizeConfig(input) {
    const source = input?.localization || input?.store?.localization || input?.settings?.localization || input?.settings || input || {};
    const rawRegions = Array.isArray(source.regions) && source.regions.length ? source.regions : DEFAULT_REGIONS;
    const regions = rawRegions.map(normalizeRegion);
    const defaultRegion = regions.find(region => region.id === String(source.defaultRegion || '').toLowerCase()) || regions[0] || normalizeRegion(DEFAULT_REGIONS[0]);
    const languages = { ...clone(DEFAULT_LANGUAGES), ...(source.languages || {}) };
    const baseCurrency = CURRENCIES[String(source.currency || 'GBP').toUpperCase()] ? String(source.currency || 'GBP').toUpperCase() : 'GBP';
    return { defaultRegion: defaultRegion.id, defaultLanguage: String(source.defaultLanguage || defaultRegion.language || 'en').toLowerCase(), locale: String(source.locale || defaultRegion.locale || 'en-GB'), currency: baseCurrency, autoDetectRegion: source.autoDetectRegion !== false, regions, languages };
  }
  function getSaved(key) { try { return root.localStorage?.getItem(key) || ''; } catch { return ''; } }
  function saveValue(key, value) { try { root.localStorage?.setItem(key, value); } catch { /* Optional preference only. */ } }
  let config = normalizeConfig({});
  let current = config.regions.find(region => region.id === config.defaultRegion) || config.regions[0];
  let language = current.language || config.defaultLanguage || 'en';
  let countryCode = '';
  let configured = false;

  function enabledLanguage(value) { return Boolean(LANGUAGES[value] && config.languages[value] && config.languages[value].enabled !== false); }
  function preferredLanguage(fallback) {
    const saved = getSaved('crocs-language-v1');
    return [saved, fallback, config.defaultLanguage, 'en'].find(enabledLanguage) || 'en';
  }

  function region(id = current?.id) { return config.regions.find(item => item.id === String(id).toLowerCase()) || current || config.regions[0]; }
  function resolveRegion(value) {
    const code = safeCode(value);
    return config.regions.find(item => item.id === String(value || '').toLowerCase()) || config.regions.find(item => item.countries.includes(code)) || region(config.defaultRegion);
  }
  function countryFromLanguage() {
    if (!root.document) return '';
    const locale = String(root.navigator?.language || '').toLowerCase();
    const map = { vi: 'VN', 'vi-vn': 'VN', 'en-us': 'US', 'en-au': 'AU', 'en-ca': 'CA', 'en-gb': 'GB', 'fr-fr': 'FR', 'de-de': 'DE', 'ja-jp': 'JP', 'ko-kr': 'KR' };
    return map[locale] || map[locale.split('-')[0]] || '';
  }
  async function detectCountry() {
    const query = root.location?.search ? new URLSearchParams(root.location.search) : null;
    const forced = query?.get('country') || query?.get('region');
    if (forced) return safeCode(forced);
    if (root.location?.protocol === 'file:') return countryFromLanguage();
    try {
      const response = await root.fetch?.('/api/geo', { headers: { Accept: 'application/json' }, signal: root.AbortSignal?.timeout?.(3500) });
      if (response?.ok) { const body = await response.json(); if (body?.countryCode) return safeCode(body.countryCode); }
    } catch { /* Vercel headers are optional; browser locale is a safe fallback. */ }
    const savedCountry = getSaved(COUNTRY_KEY);
    if (savedCountry) return safeCode(savedCountry);
    return countryFromLanguage();
  }
  function setCurrent(next, { persist = true, announce = true } = {}) {
    const resolved = typeof next === 'string' ? resolveRegion(next) : normalizeRegion(next);
    current = config.regions.find(item => item.id === resolved.id) || resolved;
    language = preferredLanguage(current.language);
    if (persist) saveValue(STORAGE_KEY, current.id);
    if (announce && root.dispatchEvent) root.dispatchEvent(new CustomEvent('crocs:region-change', { detail: { region: clone(current), countryCode, language } }));
    updateDocument();
    return current;
  }
  function formatMoney(minorUnits, opts = {}) {
    const active = region(opts.regionId);
    const currencyCode = String(opts.currency || active.currency || 'GBP').toUpperCase();
    const currency = CURRENCIES[currencyCode] || CURRENCIES.GBP;
    const locale = opts.locale || active.locale || currency.locale;
    try { return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode in CURRENCIES ? currencyCode : 'GBP', currencyDisplay: opts.currencyDisplay || 'symbol' }).format(Number(minorUnits || 0) / (10 ** currency.decimals)); }
    catch { return `${currency.symbol}${(Number(minorUnits || 0) / (10 ** currency.decimals)).toFixed(currency.decimals)}`; }
  }
  function overrideFor(product, active, variant) {
    const value = variant?.regionalPrices?.[active.id] ?? variant?.priceByRegion?.[active.id] ?? variant?.pricesByRegion?.[active.id]
      ?? product?.regionalPrices?.[active.id] ?? product?.priceByRegion?.[active.id] ?? product?.pricesByRegion?.[active.id]
      ?? active.priceOverrides?.[product?.id];
    const candidate = value && typeof value === 'object' ? (value[variant?.id] ?? value[product?.id] ?? value.amount ?? value.price) : value;
    return /^\d+$/.test(String(candidate ?? '')) && Number.isSafeInteger(Number(candidate)) ? Math.min(2147483647, Number(candidate)) : null;
  }
  function priceFor(baseMinorUnits, product, variant, regionId = current?.id) {
    const active = region(regionId);
    const override = overrideFor(product, active, variant);
    if (override != null) return override;
    const currency = CURRENCIES[active.currency] || CURRENCIES.GBP;
    const baseCurrency = CURRENCIES[config.currency] || CURRENCIES.GBP;
    const baseMajor = Number(baseMinorUnits || 0) / (10 ** baseCurrency.decimals);
    return Math.min(2147483647, Math.max(0, Math.round(baseMajor * active.exchangeRate * active.priceMultiplier * (10 ** currency.decimals) + Number.EPSILON)));
  }
  function t(key, fallback = '', values = {}) {
    const pack = DICTIONARY[language] || DICTIONARY.en;
    let text = pack[key] || DICTIONARY.en[key] || fallback || key;
    Object.entries(values).forEach(([name, value]) => { text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)); });
    return text;
  }
  const staticCopy = { '#searchTrigger span': 'search', '#searchClose': 'close', '.promo-bar a': 'shopNow', '#menuDrawer .drawer-header span': 'menu', '#cartDrawer .drawer-header span': 'bag', '#accountDrawer .drawer-header span': 'account', '#cartEmpty h2': 'emptyBag', '#cartEmpty p': 'findPair', '#cartEmpty a': 'shopClassics', '#cartSummary span': 'subtotal', '#checkoutButton': 'checkout', '.hero-content a': 'shopCollection', '.arrivals h2': 'newArrivals', '#footerAccount': 'account', '.desktop-nav .sale-link': 'sale', '.desktop-nav a:nth-child(2)': 'women', '.desktop-nav a:nth-child(3)': 'men', '.desktop-nav a:nth-child(4)': 'kids', '.desktop-nav a:nth-child(5)': 'charms', '.desktop-nav a:nth-child(6)': 'work', '.desktop-nav a:nth-child(7)': 'accessories', '.desktop-nav a:nth-child(8)': 'collaborations', '.drawer-nav a:nth-child(1)': 'sale', '.drawer-nav a:nth-child(2)': 'women', '.drawer-nav a:nth-child(3)': 'men', '.drawer-nav a:nth-child(4)': 'kids', '.drawer-nav a:nth-child(5)': 'charms', '.drawer-nav a:nth-child(6)': 'collaborations', '.drawer-nav a:nth-child(7)': 'accessories', '.classics h2': 'classicIcons', '.classics .text-link': 'shopClassicClogs', '.spotlight:not(.throwback) .eyebrow': 'softness', '.spotlight:not(.throwback) h2': 'killingSoftly', '.spotlight:not(.throwback) a': 'shopCozzy', '.charms h2': 'styleYourWay', '#tab-tattoos': 'shoeTattoos', '#tab-accessories': 'accessories', '.club h2': 'clubTitle', '.club-copy > p:last-child': 'clubCopy', '#clubForm button': 'signUp' };
  function translateStatic() {
    if (!root.document) return;
    Object.entries(staticCopy).forEach(([selector, key]) => root.document.querySelectorAll(selector).forEach(element => { element.textContent = t(key, element.textContent); }));
    const promo = root.document.querySelectorAll('.promo-bar strong');
    if (promo[0]) promo[0].textContent = `${formatMoney(priceFor(2500))}, Get ${formatMoney(priceFor(500))} Off.`;
    if (promo[1]) promo[1].textContent = `${formatMoney(priceFor(5000))}, Get ${formatMoney(priceFor(1500))} Off`;
    if (!promo.length) {
      const promoCopy = root.document.querySelector('.promo-bar p');
      if (promoCopy) {
        promoCopy.dataset.regionalCopy ||= promoCopy.textContent;
        promoCopy.textContent = promoCopy.dataset.regionalCopy.replace(/£\s*50(?:\.00)?(?!\d)/g, formatMoney(priceFor(5000))).replace(/£\s*25(?:\.00)?(?!\d)/g, formatMoney(priceFor(2500))).replace(/£\s*15(?:\.00)?(?!\d)/g, formatMoney(priceFor(1500))).replace(/£\s*5(?:\.00)?(?!\d)/g, formatMoney(priceFor(500)));
      }
    }
    const charmPrices = [999, 999, 999, 999, 1299, 1299, 1499, 499, 499, 499];
    root.document.querySelectorAll('.charm-card .price').forEach((element, index) => { const amount = charmPrices[index]; if (amount == null) return; element.textContent = element.textContent.trim().toLowerCase().startsWith('from') ? `${t('from', 'From')} ${formatMoney(priceFor(amount))}` : formatMoney(priceFor(amount)); });
    const legalLinks = root.document.querySelectorAll('.site-footer .legal a');
    if (legalLinks[2]) legalLinks[2].textContent = current?.name || config.defaultRegion;
    root.document.documentElement.lang = language;
    root.document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n, element.textContent); });
  }
  function renderPicker(mount) {
    if (!mount || !root.document) return;
    const languageOptions = Object.entries(config.languages).filter(([, item]) => item?.enabled !== false);
    mount.innerHTML = `<div class="regional-picker" title="${escape(t('detectedRegion'))}"><label><span class="sr-only">${escape(t('region'))}</span><select data-regional-region aria-label="${escape(t('region'))}">${config.regions.map(item => `<option value="${escape(item.id)}" ${item.id === current.id ? 'selected' : ''}>${escape(item.name)} · ${escape(item.currency)}</option>`).join('')}</select></label><label><span class="sr-only">${escape(t('language'))}</span><select data-regional-language aria-label="${escape(t('language'))}">${languageOptions.map(([id, item]) => `<option value="${escape(id)}" ${id === language ? 'selected' : ''}>${escape(item.nativeName || LANGUAGES[id]?.nativeName || id)}</option>`).join('')}</select></label></div>`;
    mount.querySelector('[data-regional-region]')?.addEventListener('change', event => setCurrent(event.target.value));
    mount.querySelector('[data-regional-language]')?.addEventListener('change', event => setLanguage(event.target.value));
  }
  function mountPickers() {
    if (!root.document) return;
    root.document.querySelectorAll('[data-regional-picker]').forEach(renderPicker);
    if (!root.document.querySelector('[data-regional-picker]')) {
      const host = root.document.querySelector('.site-header .header-tools, .commerce-header-actions, .checkout-header');
      if (host) { const mount = root.document.createElement('div'); mount.dataset.regionalPicker = ''; host.prepend(mount); renderPicker(mount); }
    }
  }
  function updateDocument() { translateStatic(); mountPickers(); }
  function setLanguage(next) {
    const candidate = String(next || '').toLowerCase();
    if (!enabledLanguage(candidate)) return language;
    language = candidate;
    saveValue('crocs-language-v1', language);
    updateDocument();
    root.dispatchEvent?.(new CustomEvent('crocs:language-change', { detail: { language } }));
    return language;
  }
  let configureSequence = Promise.resolve();
  async function applyConfiguration(input = {}) {
    config = normalizeConfig(input);
    const search = new URLSearchParams(root.location?.search || '');
    const isThemePreview = search.get('preview') === 'theme';
    const queryValue = search.get('region') || search.get('country') || '';
    const queryLanguage = String(search.get('language') || '').toLowerCase();
    const queryRegion = queryValue ? resolveRegion(queryValue).id : '';
    // Theme previews must be deterministic. Do not let a shopper's saved
    // region/language or IP detection leak into the admin iframe.
    const savedRegion = isThemePreview ? '' : getSaved(STORAGE_KEY);
    const explicit = queryRegion || (savedRegion && config.regions.some(item => item.id === savedRegion) ? savedRegion : '');
    if (explicit) setCurrent(explicit, { persist: false, announce: false });
    else {
      countryCode = isThemePreview ? '' : config.autoDetectRegion ? await detectCountry() : '';
      if (countryCode) saveValue(COUNTRY_KEY, countryCode);
      setCurrent(config.autoDetectRegion ? resolveRegion(queryRegion || countryCode) : config.defaultRegion, { persist: false, announce: false });
    }
    const savedLanguage = isThemePreview ? '' : getSaved('crocs-language-v1');
    if (queryLanguage && enabledLanguage(queryLanguage)) language = queryLanguage;
    else if (savedLanguage && enabledLanguage(savedLanguage)) language = savedLanguage;
    configured = true;
    updateDocument();
    root.dispatchEvent?.(new CustomEvent('crocs:localization-ready', { detail: { region: clone(current), language, countryCode } }));
    return { ...config, region: clone(current), language, countryCode };
  }
  function configure(input = {}) {
    configureSequence = configureSequence.then(() => applyConfiguration(input), () => applyConfiguration(input));
    return configureSequence;
  }
  const ready = configure();
  root.addEventListener?.('crocs:remote-theme', updateDocument);
  return { STORAGE_KEY, CURRENCIES, LANGUAGES, DEFAULT_REGIONS, DEFAULT_LANGUAGES, DICTIONARY, get config() { return config; }, get region() { return current; }, get language() { return language; }, get countryCode() { return countryCode; }, get configured() { return configured; }, ready, configure, detectCountry, resolveRegion, setRegion: setCurrent, setLanguage, formatMoney, money: formatMoney, priceFor, convert: (minor, regionId) => priceFor(minor, null, null, regionId), t, translateStatic, mountPickers, normalizeConfig };
});
