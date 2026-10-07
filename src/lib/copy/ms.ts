import type { Dictionary } from "./en";

/** Bahasa Malaysia. Typed against `Dictionary` for the same reason as `zh`. */
export const ms: Dictionary = {
	meta: {
		title: "EzCabinet · Reka dapur anda dalam 3D",
		description:
			"Letakkan unit EzCabinet sebenar ke dalam model bilik anda sendiri, lihat dari setiap sudut, dan dapatkan harga serta-merta. Tidak perlu ke bilik pameran.",
	},
	common: {
		whatsappHelp: "Hubungi kami di WhatsApp",
		copyValue: "Salin {label}",
		brand: "EzCabinet",
		back: "Kembali",
		next: "Seterusnya",
		close: "Tutup",
		language: "Bahasa",
		comingSoon: "Akan datang",
	},
	landing: {
		nav: {
			howItWorks: "Cara ia berfungsi",
			gallery: "Galeri",
			finishes: "Kemasan",
			faq: "Soalan lazim",
			tutorials: "Tutorial",
			menu: "Menu",
			startPlanning: "Mula reka bentuk",
			admin: "Pentadbir",
		},
		hero: {
			eyebrow: "Percuma untuk cuba · tiada akaun diperlukan",
			titleBeforeAccent: "Reka dapur anda",
			titleAccent: "dalam 3D",
			subtitle:
				"Letakkan unit EzCabinet sebenar ke dalam bilik anda sendiri, lihat harga berubah semasa anda reka, dan hantarkan pelan itu terus kepada kami.",
			cta: "Mula reka bentuk",
			howItWorks: "Cara ia berfungsi",
			alt: "Dapur EzCabinet yang telah siap",
		},
		facts: {
			cabinetsFromLabel: "Kabinet dari",
			typicalDeliveryValue: "4-6 minggu",
			typicalDeliveryLabel: "Tempoh penghantaran biasa",
			warrantyValue: "5 tahun",
			warrantyLabel: "Waranti perkakasan dan binaan",
			noAccountValue: "Tiada akaun",
			noAccountLabel: "Diperlukan untuk reka bentuk dan harga",
		},
		how: {
			heading: "Tiga langkah dari dinding kosong ke sebut harga",
			step1Title: "Pilih bilik anda",
			step1Detail:
				"Pilih dapur, ruang tamu, bilik tidur atau anjung, dan tetapkan dimensi dinding sebenar anda.",
			step2Title: "Susun kabinet, mengikut skala sebenar",
			step2Detail:
				"Susun unit EzCabinet sebenar dalam 3D dan tukar kemasan sehingga kelihatan tepat.",
			step3Title: "Dapatkan sebut harga serta-merta",
			step3Detail:
				"Lihat harga secara langsung semasa anda menyusun, kemudian hantar pelan anda terus kepada pasukan kami.",
		},
		gallery: {
			heading: "Terokai mengikut bilik",
			subtitle:
				"Setiap bilik bermula daripada saiz kabinet EzCabinet sebenar dan susun atur yang sedia ada pada dinding anda.",
			roomAlt: "kabinet {room}",
			roomSubtitle: {
				kitchen: "Saiz kabinet EzCabinet sebenar",
				living: "Rak TV & unit paparan",
				bedroom: "Almari pakaian",
				foyer: "Kabinet kasut & bangku",
			},
		},
		finishes: {
			heading: "Kemasan & bahan",
			subtitle:
				"Tukar kemasan pada mana-mana kabinet terus dalam alat reka bentuk.",
		},
		faq: {
			heading: "Soalan lazim",
			q1: "Berapa lama tempoh penghantaran?",
			a1: "Kebanyakan pesanan tiba dalam 4-6 minggu selepas pelan anda disahkan, bergantung pada kemasan dan saiz kabinet.",
			q2: "Bolehkah saya minta kabinet dipasang sekali?",
			a2: "Boleh. Pemasangan boleh ditambah apabila anda menghantar pelan kepada pasukan kami untuk sebut harga akhir.",
			q3: "Kabinet ini diperbuat daripada apa?",
			a3: "Badan kabinet solid dengan pilihan kemasan venir, laminat atau bersalut, julat penuh boleh dilihat dalam alat reka bentuk.",
			q4: "Bolehkah saya ubah reka bentuk selepas membuat pesanan?",
			a4: "Perubahan adalah percuma sebelum pengeluaran bermula. Pasukan kami akan sahkan pelan anda terlebih dahulu.",
			q5: "Adakah anda menawarkan waranti?",
			a5: "Setiap kabinet disertakan waranti 5 tahun untuk perkakasan dan binaan.",
		},
		closing: {
			heading:
				"Dinding anda, saiz anda, harga anda. Dalam lebih kurang lima minit.",
			subtitle: "Tiada apa untuk dipasang dan tiada apa untuk didaftar.",
			cta: "Mula reka bentuk",
		},
		footer: {
			tagline:
				"Kabinet tersuai, direka dalam 3D dan dibina mengikut dimensi sebenar bilik anda.",
			productHeading: "Produk",
			startPlanning: "Mula reka bentuk",
			gallery: "Galeri",
			faq: "Soalan lazim",
			tutorials: "Tutorial",
			contactHeading: "Hubungi kami",
			email: "hello@ezcabinet.com",
			privacy: "Privasi",
			terms: "Terma jualan",
			refunds: "Polisi bayaran balik",
			adminSignIn: "Log masuk admin",
			copyright: "© 2026 {brand}. Hak cipta terpelihara.",
		},
	},
	planner: {
		crumbs: {
			roomPlanner: "Perancang bilik",
			studio: "Ruang reka",
			quote: "Sebut harga",
		},
		breadcrumbAriaLabel: "Navigasi remah roti",
		admin: "Pentadbir",
		changeRoom: "Tukar bilik",
		diyTutorials: "Tutorial DIY",
		clear: "Kosongkan",
		dimensionAriaSuffix: "{label} dalam milimeter",
		tools: {
			ariaLabel: "Alat",
			select: "Pilih",
			add: "Tambah",
			room: "Bilik",
			measure: "Ukur",
			view: "Paparan",
			doors: "Pintu",
			defaults: "Tetapan",
			selectTitle: "Pilih dan alihkan kabinet",
			addTitle: "Tambah kabinet",
			roomTitle: "Saiz bilik: dinding, siling dan kedalaman",
			measureTitle: "Ukur jarak antara dua titik",
			viewTitle: "Paparan: 3D, elevasi atau pelan",
			doorsTitle: "Pintu: buka, tutup atau sembunyi",
			defaultsTitle: "Tetapan lalai untuk seluruh baris",
		},
		panel: {
			close: "Tutup panel",
			addTitle: "Tambah kabinet",
			addHint:
				"Klik untuk meletakkannya di hujung baris, atau seret ke dinding.",
			viewTitle: "Paparan",
			viewHint: "Cara bilik dilukis.",
			threeDHint: "Lihat bilik seperti rupanya nanti.",
			elevationHint: "Rata dari depan — terbaik untuk menetapkan saiz.",
			planHint: "Dari atas — terbaik untuk kedalaman dan laluan.",
			resetView: "Set semula pandangan",
			resetViewHint: "Rangka semula keseluruhan larian.",
			doorsTitle: "Pintu",
			doorsHint:
				"Terpakai untuk semua unit. Pintu satu kabinet dibuka melalui tindakan Buka pintu miliknya.",
			defaultsTitle: "Tetapan lalai untuk baris ini",
			defaultsHint:
				"Tetapkan sekali, terpakai untuk semua — sudah diletak atau belum.",
		},
		start: {
			heading: "Bilik apa yang anda ingin rancang?",
			subtitle:
				"Pilih satu untuk bermula pada dinding kosong dengan saiz EzCabinet sebenar.",
			roomIconAlt: "Ikon {room}",
			roomSubtitle: {
				kitchen: "Saiz EzCabinet sebenar",
				living: "Rak TV & unit paparan",
				bedroom: "Almari pakaian",
				foyer: "Kabinet kasut & bangku",
			},
			cta: "Mula merancang",
		},
		room: {
			fitFree: "{mm} mm dinding masih kosong.",
			fitOver:
				"Baris ini {mm} mm lebih panjang daripada dinding. Buang satu kabinet atau panjangkan dinding.",
			moreSettings: "Papan kaki, hujung, ketinggian gantung…",
			next: "Seterusnya: tambah kabinet",
			heading: "Bilik",
			subtitle: "Menetapkan ruang yang perlu dimuatkan oleh setiap kabinet.",
			ceiling: "Siling",
			shape: "Susun atur",
			shapeRect: "Segi empat",
			shapeL: "Bentuk L",
			shapeLMirror: "Bentuk L, bertentangan",
			shapeLocked:
				"Bentuk yang kelabu akan meninggalkan kabinet tanpa dinding — di sudut baharu, atau melepasi hujung dinding yang lebih pendek. Alihkannya dahulu.",
			wallName: "Dinding {n}",
			paint: "Cat dinding",
			paintNone: "Tiada cat",
			paintAria: "Cat dinding {n}",
			paintCustom: "Warna sendiri",
			paintingWall: "Mengecat dinding {n}",
			paintAll: "Sapukan pada semua dinding",
			wallsHint:
				"Ketik dinding dalam bilik, atau ukuran dalam pandangan pelan, untuk mengubahnya.",
			wallUnitsHangAt: "Unit dinding tergantung pada",
			wallUnitsAria: "Unit dinding",
			hanging: "Tergantung",
			toCeiling: "Sampai ke siling",
			undersidesNote:
				"Bahagian bawah pada {height}mm — bahagian atas naik sampai ke siling, ditutup dengan jalur kemasan.",
			flushWallUnitTops:
				"Selaraskan bahagian atas unit dinding dengan unit tinggi",
			addTallFirst: "Tambah kabinet tinggi atau ruang peti sejuk dahulu",
			baseUnitsAria: "Unit asas",
			skirted: "Berpapan kaki",
			legsShown: "Kaki ditunjukkan",
			kickBoardNote:
				"Papan kaki dipasang sepanjang lantai, menyembunyikan kaki pelaras.",
			levellersNote:
				"Kaki pelaras yang boleh diselaraskan kelihatan di bawah susunan.",
			doorsAria: "Pintu",
			doorsClosed: "Pintu tertutup",
			doorsOpen: "Pintu terbuka",
			doorsHidden: "Pintu disembunyikan",
			frontsOffNote:
				"Pintu ditanggalkan, jadi keseluruhan susunan kelihatan sekali gus. Dua pintu yang berengsel pada tiang yang sama tidak boleh dibuka serentak, sebab itu paparan ini menanggalkannya.",
			interiorsShownNote:
				"Rak dan bahagian dalam kelihatan. Mengukur akan menutupnya semula.",
			openDoorsNote:
				"Buka pintu, atau tanggalkan pintu, untuk melihat bahagian dalam susunan.",
			overhangWarning:
				"Susunan ini melebihi dinding sebanyak {overhang}mm — rapatkan jurang di bawah, atau buang satu kabinet.",
		},
		view: {
			ariaLabel: "Paparan",
			threeD: "Paparan 3D",
			elevation: "Pandangan sisi",
			plan: "Pelan",
		},
		addCabinets: {
			targetWall: "Tambah ke",
			targetWallHint:
				"Menambah ke dinding {n}. Ketik dinding lain dalam bilik untuk membina di sana.",
			heading: "Tambah kabinet",
			subtitle: "Seret ke dinding. Saiz dan pintu boleh dipilih kemudian.",
			sizeRange: "{min}–{max}mm · dari {price}",
			widthPrice: "Lebar {width}mm · {price}",
			categories: {
				BASE_CABINET: "Kabinet bawah",
				WALL_CABINET: "Kabinet dinding",
				TALL_CABINET: "Kabinet tinggi",
				DRAWER_BASE: "Kabinet laci",
				FRIDGE_HOUSING: "Kabinet peti sejuk",
				CORNER_BASE_CABINET: "Kabinet sudut bawah",
				CORNER_WALL_CABINET: "Kabinet sudut dinding",
			},
		},
		canvas: {
			contextLost: "Paparan 3D terhenti. Reka bentuk anda selamat.",
			contextReload: "Muat semula paparan 3D",
			selectHint:
				"Klik kabinet untuk memilihnya · klik kanan untuk tindakannya",
			runOfWall: "Susunan {run} m pada dinding {wall} m",
			loading: "Memuatkan paparan 3D…",
		},
		measure: {
			tooltip:
				"Klik dua titik pada kabinet — bucu, titik tengah tepi, atau permukaan — untuk mengukur jaraknya",
			measuring: "Sedang mengukur…",
			measure: "Ukur",
			constrainLabel: "Hadkan arah pengukuran",
			clickToStart: "Klik satu titik untuk mula mengukur",
			clickSecondPoint: "Klik titik kedua",
			hintMeasuring:
				"Klik dua titik pada kabinet — bucu, titik tengah tepi atau permukaan. Auto mengunci titik kedua pada paksi yang anda ukur; Bebas membaca ketiga-tiga paksi sekali gus.",
			hintDefault:
				"Klik kabinet untuk menukar saiz atau pintunya. Seret di sepanjang dinding untuk menggerakkannya.",
		},
		selection: {
			hangAtThis: "Yang ini digantung pada",
			swapLeft: "Tukar tempat dengan kabinet di kirinya",
			swapRight: "Tukar tempat dengan kabinet di kanannya",
			swapHint:
				"Anak panah menukar tempatnya dengan kabinet di sebelah, jadi baris yang padat kekal padat. Taip satu angka untuk memindahkannya ke tempat yang ada ruang.",
			verbResize: "Ubah saiz",
			verbReplace: "Ganti",
			verbMove: "Alih",
			verbOpenDoors: "Buka pintu",
			verbCloseDoors: "Tutup pintu",
			moveMeta: "anak panah + mm",
			replaceHeading: "Ganti dengan",
			positionHeading: "Kedudukan",
			gapLeft: "Jarak kiri",
			gapRight: "Jarak kanan",
			editGap: "Ubah jarak",
			widthHint:
				"Kabinet sebelah kekal di tempatnya — saiz yang tidak muat dikelabukan. {name} ada {n} lebar.",
			moveHintFloor:
				"Anak panah menggerakkannya di sepanjang dinding dan mengangkatnya dari lantai. Gelang memusingkannya.",
			moveHintWall:
				"Anak panah menggerakkannya di sepanjang dinding dan menetapkan ketinggian gantungnya. Gelang memusingkannya.",
			hangsAt: "digantung pada {mm} mm",
			standsAt: "Yang ini berdiri pada",
			turnedBy: "Dipusing",
			sizeRangeMeta: "lebar {min}–{max} mm",
			heading: "Kabinet dipilih",
			emptyHint:
				"Klik kabinet dalam bilik untuk menetapkan saiz atau menukar pintunya.",
			nameWidth: "{name} ({width} mm)",
			width: "Lebar",
			noRoom: "tiada ruang",
			front: "Pintu",
			swing: "Bukaan",
			closeDoor: "Tutup pintu",
			openDoor: "Buka pintu",
			hingeLeft: "Engsel kiri",
			hingeRight: "Engsel kanan",
			duplicate: "Duplikat",
			remove: "Buang",
			nSelected: "{n} kabinet dipilih",
			removeAll: "Buang semua {n}",
		},
		design: {
			heading: "Reka bentuk ini",
			hint: "Klik kabinet dalam bilik untuk ubah saiz, ganti atau alihkannya.",
			room: "Bilik",
			wall: "Dinding",
			run: "Baris",
			wallFree: "Dinding kosong",
			overBy: "lebih {mm} mm",
			finish: "Kemasan",
			addCabinet: "Tambah kabinet",
		},
		finish: {
			heading: "Kemasan pintu · seluruh susunan",
			currentLabel: "{label} · satu warna untuk seluruh bilik",
		},
		run: {
			heading: "Susunan anda · {count} {unit}",
			closeGaps: "Rapatkan jurang",
			closeGapsCount: "Rapatkan jurang ({n})",
			selectAria: "Pilih {name}",
			noDoorInline: "tiada pintu",
			emptyHint: "Belum ada yang diletakkan — seret badan kabinet ke dinding.",
			reset: "Set semula bilik ini",
			resetConfirm:
				"Set semula bilik ini? Semua kabinet, bentuk bilik dan cat dinding akan dipadam. Ini tidak boleh dibuat asal.",
		},
		price: {
			breakdown: "Perincian",
			breakdownTitle: "Apa yang membentuk {total}",
			trimStrip: "jalur kemasan yang menutup susunan di siling",
			skirtingBoard: "papan kaki di atas kaki pelaras",
			endPanels: "panel siap pada setiap sisi kabinet yang terdedah",
			and: "dan",
			includedAboveSingular: "telah disertakan di atas.",
			includedAbovePlural: "telah disertakan di atas.",
			estimatedTotal: "Jumlah anggaran",
			estimateBadge: "ANGGARAN",
			placeholderNote:
				"Kadar sementara — bukan sebut harga sehingga disahkan oleh EzCabinet.",
			cta: "Dapatkan sebut harga untuk reka bentuk ini",
			lines: {
				carcasses: "Badan kabinet",
				doors: "Pintu",
				worktop: "Meja atas",
				ceilingTrim: "Jalur kemasan siling",
				skirting: "Papan kaki",
				endPanels: "Panel hujung",
			},
			detail: {
				unitCountOne: "{count} unit kabinet",
				unitCountOther: "{count} unit kabinet",
				noDoors: "belum dipilih",
				doorCountOne: "{count} pintu",
				doorCountOther: "{count} pintu",
				lengthRate: "{ft} kaki @ RM {rate}/kaki",
				endPanelsOne: "{count} panel pada sisi terdedah",
				endPanelsOther: "{count} panel pada sisi terdedah",
			},
		},
		unit: "unit kabinet",
		units: "unit kabinet",
	},
	quote: {
		loading: "Memuatkan…",
		backToEditing: "Kembali menyunting",
		savedHeading: "Disimpan — untuk demo sahaja",
		savedBody:
			"Ciri penangkapan bakal pelanggan belum disambungkan kepada EzCabinet lagi (itu fasa kemudian projek ini). Tiada apa-apa dihantar.",
		heading: "Pesan {room} ini",
		description:
			"Buat pesanan, kemudian bayar melalui pindahan bank. Pereka bentuk akan mengesahkan ukuran anda di tapak sebelum apa-apa dibina.",
		fullName: "Nama penuh",
		phone: "Telefon (WhatsApp)",
		email: "E-mel",
		area: "Kawasan",
		siteAddress: "Alamat penghantaran",
		addressNotes: "Nota akses — unit, kod pagar, lif",
		remeasureNote:
			"Saya faham pereka bentuk akan mengukur semula di tapak sebelum pengeluaran dan akan menghubungi saya jika reka bentuk perlu diubah.",
		whatsappOptIn: "Hantar kemas kini pesanan ke nombor ini melalui WhatsApp",
		saved: "Disimpan",
		submitCta: "Teruskan ke pembayaran",
		errorNameRequired: "Masukkan nama penuh anda.",
		errorPhoneRequired: "Masukkan nombor telefon yang boleh kami hubungi.",
		errorAddressRequired: "Masukkan alamat penghantaran.",
		errorAddressShort: "Alamat itu kelihatan terlalu pendek.",
		errorRemeasure: "Tandakan ini untuk meneruskan.",
		termsAgree: "Saya bersetuju dengan terma jualan dan polisi bayaran balik.",
		termsLink: "Terma jualan",
		refundsLink: "Polisi bayaran balik",
		errorTerms: "Tandakan ini untuk membuat pesanan.",
		soldBy: "Dijual oleh {address}. Hubungi {email} atau {phone}.",
		submitting: "Sedang membuat pesanan…",
		descriptionOnline:
			"Pereka akan mengukur semula di tapak sebelum apa-apa dibina.",
		sectionContact: "Hubungan",
		sectionDelivery: "Penghantaran",
		sectionPayment: "Pembayaran",
		payCta: "Bayar · {amount}",
		paying: "Memproses pembayaran…",
		paymentSecure:
			"Pembayaran diproses oleh Stripe. Kami tidak pernah melihat kad atau log masuk bank anda.",
		paymentFailedTitle: "Pembayaran tidak berjaya",
		paymentFailedBody:
			"Tiada caj dikenakan. Butiran anda telah disimpan. Cuba lagi atau pilih cara pembayaran lain.",
		errorEmailRequired: "Masukkan e-mel untuk resit anda.",
		errorEmailInvalid: "Alamat e-mel itu nampaknya tidak betul.",
		signInTitle: "Log masuk untuk membuat pesanan",
		signInBody:
			"Setiap pesanan dimiliki oleh satu akaun supaya anda boleh mengikutinya kemudian. Reka bentuk anda disimpan, dan anda akan kembali terus ke sini.",
		oneOffPayment: "Bayaran sekali sahaja",
		errorGeneric: "Pesanan anda tidak dapat dibuat. Sila cuba lagi.",
		errorPhone:
			"Nombor telefon itu kelihatan tidak betul. Masukkan 9 atau 10 digit selepas +60, contohnya 12 345 6789.",
		errorDesign:
			"Ada bahagian reka bentuk ini yang tidak boleh dipesan seperti sedia ada. Kembali menyunting dan semak kabinet anda.",
		subtotal: "Kabinet",
		delivery: "Penghantaran",
		total: "Jumlah",
		summary: "{room} · baris {runs} · {count} {unit}",
		noFrontsYet: "belum pilih sebarang pintu",
		frontsLabel: "pintu {label}",
		mixedFronts: "pintu bercampur",
		estimatedTotal: "Jumlah anggaran",
		estimateBadge: "ANGGARAN",
		notAQuoteNote: "Bukan sebut harga sehingga disahkan di tapak.",
	},
	tutorials: {
		eyebrow: "Belajar",
		heading: "Tutorial DIY",
		subtitle:
			"Video pendek yang menunjukkan cara memasang setiap jenis kabinet kami, daripada kabinet bawah dan dinding hingga konsol TV dan almari pakaian.",
		allTypes: "Semua jenis",
		emptyNoTutorials:
			"Tutorial sedang dirakam. Sila semak semula tidak lama lagi.",
		emptyNoMatches: "Belum ada video untuk jenis kabinet ini.",
		loadingPlayer: "Memuatkan pemain…",
		copyright: "© Hak cipta {brand}",
		backToSite: "Kembali ke laman utama",
		categories: {
			base: "Kabinet bawah",
			wall: "Kabinet dinding",
			tall: "Kabinet tinggi",
			drawer: "Kabinet laci",
			fridge: "Kabinet peti sejuk",
			tv: "Kabinet TV",
			wardrobe: "Almari pakaian",
			shoe: "Kabinet kasut",
		},
	},
	order: {
		editDetails: "Ubah butiran",
		saveDetails: "Simpan perubahan",
		savingDetails: "Menyimpan…",
		cancelEdit: "Batal",
		detailsLocked:
			"Butiran ini tidak lagi boleh diubah di sini. Hubungi kami dan kami akan bantu.",
		detailsError: "Perubahan anda tidak dapat disimpan. Sila cuba lagi.",
		headingConfirming: "Mengesahkan pembayaran anda",
		bodyConfirming:
			"Terima kasih — kami sedang menunggu pengesahan daripada penyedia pembayaran. Biasanya ini mengambil beberapa saat, dan halaman ini akan dikemas kini sendiri. Anda tidak perlu membayar lagi.",
		headingProcessing: "Menunggu bank anda",
		bodyProcessing:
			"Bank anda belum mengesahkan. Jika wang telah keluar dari akaun anda, ia akan dipaparkan di sini sebaik sahaja disahkan, biasanya dalam masa 30 minit. Anda tidak perlu membayar lagi.",
		bodyAwaitingOnline:
			"Terima kasih, pesanan anda telah disimpan. Bayar jumlah di bawah untuk mengesahkannya.",
		payOnlineHeading: "Bayar dalam talian",
		payOnlineCta: "Bayar {amount}",
		payOnlineError:
			"Kami tidak dapat memuatkan borang pembayaran. Muat semula halaman untuk mencuba lagi.",
		headingAwaiting: "Pesanan dibuat — menunggu bayaran",
		bodyAwaiting:
			"Terima kasih, pesanan anda telah disimpan. Pindahkan jumlah di bawah untuk mengesahkannya.",
		headingPaid: "Pesanan disahkan",
		bodyPaid: "Bayaran diterima. Kabinet anda akan mula dikeluarkan.",
		headingCancelled: "Pesanan dibatalkan",
		bodyCancelled:
			"Pesanan ini telah dibatalkan. Hubungi kami jika ini di luar jangkaan anda.",
		copyOrderId: "Salin ID pesanan",
		copied: "Disalin",
		summaryHeading: "Ringkasan pesanan",
		qty: "Kuantiti {count}",
		subtotal: "Subjumlah",
		delivery: "Penghantaran",
		totalPaid: "Jumlah dibayar",
		addressHeading: "Alamat penghantaran",
		payHeading: "Bayar melalui pindahan bank",
		payBank: "Nama bank",
		payAccountName: "Nama akaun",
		payAccountNumber: "Nombor akaun",
		payReference: "Rujukan",
		payAmount: "Amaun",
		payNote:
			"Gunakan ID pesanan anda sebagai rujukan pindahan supaya kami dapat memadankan bayaran anda. Kami akan menghubungi anda sebaik ia diterima, lazimnya dalam satu hari bekerja.",
		stagePaid: "Bayaran diterima",
		stageMeasureDetail:
			"Pereka bentuk mengesahkan ukuran anda sebelum pengeluaran.",
		stages: {
			MEASURE: "Ukur semula di tapak",
			CUTTING: "Pemotongan papan",
			EDGING: "Pelekatan jalur tepi",
			ASSEMBLY: "Pemasangan",
			QC: "Pemeriksaan kualiti",
			READY: "Sedia untuk dihantar",
		},
		stageDelivery: "Penghantaran ke tapak anda",
		trackDelivery: "Jejak penghantaran anda",
		progressHeading: "Kemajuan",
		totalDue: "Jumlah perlu dibayar",
	},
	track: {
		headingPlaced: "Pesanan diterima",
		bodyPlaced:
			"Terima kasih — pesanan anda sudah kami terima dan sedang disediakan.",
		headingDelivered: "Telah dihantar",
		bodyDelivered:
			"Kabinet anda sudah sampai. Terima kasih kerana memilih kami.",
		headingStopped: "Penghantaran ditangguhkan",
		bodyStopped:
			"Penghantaran ini tidak berjaya. Pasukan kami akan menghubungi anda.",
		orderId: "Nombor pesanan",
		copyOrderId: "Salin nombor pesanan",
		copied: "Disalin",
		summaryHeading: "Ringkasan pesanan",
		qty: "Kuantiti {count}",
		noItems: "Senarai muatan masih dimuktamadkan.",
		addressHeading: "Alamat penghantaran",
		statusHeading: "Status penghantaran",
		etaHeading: "Anggaran penghantaran",
		etaPending: "Akan disahkan",
		carrierRef: "{carrier} · Rujukan {reference}",
		carrierBooked: "Dihantar oleh {carrier}",
		timelineEmpty: "Tiada rekod buat masa ini.",
		awaitingHeading: "Penghantaran",
		awaitingEtaHeading: "Jangka masa dijangka",
		awaitingStatus: "Sedang diatur",
		awaitingCarrier: "Rakan penghantaran belum ditempah",
		stagePlaced: "Pesanan diterima",
		stageBuilding: "Kabinet sedang dibina",
		stageBuildingDetail: "Sedang dibuat di bengkel",
		awaitingNote:
			"Rakan penghantaran ditempah sebaik kabinet anda siap. Ketika itu penjejakan akan muncul di sini dan kami hantar pautannya kepada anda.",
		awaitingNoteSub:
			"Lazimnya dua hingga tiga hari bekerja sebelum tarikh penghantaran anda. Tiada apa-apa diperlukan daripada anda sehingga itu.",
		backToPlanner: "Kembali ke perancang",
		backHome: "Kembali ke laman utama",
		status: {
			DRAFT: "Sedang diatur",
			QUOTED: "Sedang diatur",
			BOOKED: "Pesanan diterima",
			DRIVER_ASSIGNED: "Pemandu ditugaskan",
			PICKED_UP: "Telah dikutip",
			IN_TRANSIT: "Dalam perjalanan",
			DELIVERED: "Telah dihantar",
			CANCELLED: "Dibatalkan",
			FAILED: "Gagal",
		},
	},
	consent: {
		title: "Bantu kami menambah baik perancang",
		body: "Benarkan kami merekod cara anda menggunakan perancang dan sebarang ralat, diproses oleh PostHog di EU (di luar Malaysia). Apa-apa yang anda taip tidak disertakan. Jika anda menolak, kami hanya mengira lawatan, tanpa kuki.",
		accept: "Benarkan",
		reject: "Tolak",
		learnMore: "Notis privasi",
	},
	privacy: {
		title: "Notis privasi",
		draft: "Draf — menunggu semakan EzCabinet Sdn Bhd sebelum berkuat kuasa.",
		intro:
			"Notis ini menerangkan apa yang direkod oleh perancang EzCabinet apabila anda menggunakannya, dan sebabnya.",
		purposeHeading: "Tujuan",
		purpose:
			"Untuk mengenal pasti bahagian perancang yang mengelirukan atau rosak, dan membaikinya.",
		collectHeading: "Apa yang kami rekod",
		collect:
			"Skrin yang anda buka, pilihan reka bentuk anda (bilik, kabinet, saiz, kemasan, pintu), anggaran harga, jenis peranti dan pelayar, serta ralat teknikal yang berlaku dalam perancang. Jika anda benarkan, kami juga menyimpan rakaman ringkas halaman — dengan semua yang anda taip disembunyikan — apabila ralat berlaku, supaya kami dapat melihat puncanya.",
		notCollectHeading: "Apa yang kami tidak pernah rekod",
		notCollect:
			"Nama, nombor telefon, e-mel atau alamat daripada borang sebut harga tidak dihantar kepada penyedia analitik kami. Kami tidak menyimpan alamat IP anda dalam analitik.",
		whereHeading: "Siapa yang memprosesnya, dan di mana",
		where:
			"Data penggunaan diproses oleh PostHog Inc. pada pelayan di Kesatuan Eropah (Frankfurt), di bawah perjanjian pemprosesan data. Ini bermakna data dipindahkan ke luar Malaysia. Laman web ini sendiri dihoskan oleh Vercel.",
		whatsappHeading: "Kemas kini pesanan melalui WhatsApp",
		whatsapp:
			"Jika anda menanda kotak semasa pembayaran, kami akan menghantar kemas kini tentang pesanan anda — bayaran, langkah pengeluaran dan penghantaran — ke nombor telefon anda melalui WhatsApp. WhatsApp dikendalikan oleh Meta Platforms, yang memproses nombor anda dan mesej ini, mungkin di luar Malaysia. Kami tidak menghantar apa-apa lagi, dan anda boleh menghentikan kemas kini dengan menyekat nombor tersebut.",
		accountHeading: "Akaun anda",
		account:
			"Apabila anda log masuk dengan Google, kami menerima nama, alamat e-mel dan foto profil anda, dan menyimpannya sebagai akaun anda.",
		ordersHeading: "Pesanan anda",
		orders:
			"Apabila anda membuat pesanan, kami menyimpan nama, nombor telefon, e-mel, alamat penghantaran, reka bentuk yang dipesan dan harganya sebagai rekod jualan.",
		recipientsHeading: "Siapa lagi yang menerima data anda",
		recipients:
			"Pemproses pembayaran kami menerima butiran kad dan bil anda — butiran ini tidak sampai ke pelayan kami. Syarikat kurier yang menghantar pesanan anda menerima nama, nombor telefon dan alamat anda. Google mengendalikan log masuk. Mux menstrim video tutorial kami dan oleh itu melihat alamat IP penonton. Sebahagian syarikat ini memproses data di luar Malaysia.",
		obligatoryHeading: "Apa yang anda mesti berikan",
		obligatory:
			"Semua ini datang terus daripada anda, atau daripada Google apabila anda log masuk. Melayari dan merancang tidak memerlukan apa-apa data. Untuk membuat pesanan, anda mesti memberikan nama, nombor telefon dan alamat penghantaran — tanpanya kami tidak dapat menghantar pesanan. E-mel dan kemas kini WhatsApp adalah pilihan.",
		retentionHeading: "Tempoh simpanan",
		retention:
			"Rekod pesanan disimpan selama yang dikehendaki oleh undang-undang cukai dan perakaunan. Akaun tanpa pesanan disimpan sehingga anda meminta kami memadamnya.",
		rightsHeading: "Hak anda",
		rights:
			"Anda boleh meminta untuk melihat data peribadi yang kami simpan tentang anda, membetulkannya, menerima salinan dalam bentuk mudah alih, menarik balik persetujuan, atau meminta kami berhenti menggunakannya untuk pemasaran langsung. Tulis kepada alamat hubungan di bawah.",
		otherLawsHeading: "Undang-undang lain",
		otherLaws:
			"Notis ini diberikan di bawah Akta Perlindungan Data Peribadi 2010 Malaysia. Penyedia analitik kami memproses data penggunaan di Kesatuan Eropah di bawah perjanjian pemprosesan datanya sendiri; EzCabinet menjual di Malaysia sahaja.",
		choiceHeading: "Pilihan anda",
		choice:
			"Jika anda menolak, kami hanya mengira lawatan tanpa kuki atau storan tempatan, dengan pengecam yang ditetapkan semula setiap hari, dan tiada rakaman dibuat. Anda boleh menukar pilihan pada bila-bila masa dengan memadam data laman ini dalam pelayar anda.",
		contactHeading: "Hubungi kami",
		contact:
			"Pertanyaan, atau permintaan untuk mengakses atau membetulkan data anda: {email}",
		back: "Kembali ke laman utama",
	},
	terms: {
		title: "Terma jualan",
		intro:
			"Terma ini terpakai apabila anda memesan kabinet melalui perancang EzCabinet. Sila baca bersama polisi bayaran balik sebelum membayar.",
		sellerHeading: "Penjual",
		seller: "{address}. E-mel {email}, telefon {phone}.",
		goodsHeading: "Apa yang anda beli",
		goods:
			"Kabinet yang dibuat mengikut tempahan berdasarkan reka bentuk yang anda hantar. Paparan 3D ialah ilustrasi; ukuran akhir disahkan apabila kami mengukur semula tapak anda.",
		priceHeading: "Harga",
		price:
			"Harga adalah dalam Ringgit Malaysia (RM) dan dipaparkan sepenuhnya semasa pembayaran, termasuk caj penghantaran dan sebarang cukai yang dikenakan. Harga yang dikenakan ialah harga yang dikira oleh sistem kami semasa pesanan dibuat.",
		paymentHeading: "Pembayaran",
		payment:
			"Anda boleh membayar dengan kad melalui penyedia pembayaran kami, atau melalui pindahan bank jika ditawarkan. Pesanan anda disahkan setelah kami menerima bayaran penuh.",
		remeasureHeading: "Ukur semula",
		remeasure:
			"Pereka akan mengukur tapak anda sebelum pengeluaran. Jika reka bentuk perlu diubah, kami akan memberi sebut harga perubahan itu dan mendapatkan persetujuan anda sebelum pengeluaran bermula.",
		deliveryHeading: "Penghantaran",
		delivery:
			"Kami menghantar ke alamat yang anda berikan semasa pembayaran, biasanya dalam masa 4 hingga 6 minggu selepas ukur semula, dan memaklumkan anda apabila penghantaran ditempah. Sila pastikan ada orang untuk menerimanya.",
		changesHeading: "Membetulkan pesanan anda",
		changes:
			"Anda boleh mengubah reka bentuk dan butiran anda pada bila-bila masa sebelum membayar. Jika anda menyedari kesilapan selepas itu, tulis kepada {email} dengan segera; kami boleh membetulkannya sehingga pengeluaran bermula.",
		rightsHeading: "Hak anda sebagai pengguna",
		rights:
			"Tiada apa-apa dalam terma ini atau polisi bayaran balik yang mengehadkan hak anda di bawah Akta Perlindungan Pengguna 1999, termasuk jaminan bahawa barangan berkualiti boleh terima dan menepati perihalannya.",
		complaintsHeading: "Aduan",
		complaints:
			"Tulis kepada {email} dengan rujukan pesanan anda dan kami akan membalas. Jika kami tidak dapat menyelesaikannya, anda boleh membawa perkara itu ke Tribunal Tuntutan Pengguna Malaysia.",
		lawHeading: "Undang-undang yang mentadbir",
		law: "Terma ini ditadbir oleh undang-undang Malaysia.",
	},
	refunds: {
		title: "Polisi bayaran balik",
		intro:
			"Kabinet kami dibuat mengikut tempahan, jadi sama ada pesanan boleh dibayar balik bergantung pada sama ada pengeluaran telah bermula.",
		beforeHeading: "Membatalkan sebelum pengeluaran bermula",
		before:
			"Anda boleh membatalkan dengan bayaran balik penuh pada bila-bila masa sebelum pengeluaran bermula. Halaman pesanan anda menunjukkan bila ia bermula.",
		afterHeading: "Membatalkan selepas pengeluaran bermula",
		after:
			"Setelah pengeluaran bermula, pesanan tidak boleh dibatalkan atau dibayar balik kerana kabinet sedang dibuat mengikut reka bentuk anda.",
		damagedHeading: "Rosak atau cacat semasa penghantaran",
		damaged:
			"Maklumkan kami dalam masa 7 hari selepas penghantaran, bersama gambar. Kami akan membaiki atau menggantikan kabinet yang terjejas tanpa kos kepada anda, termasuk penghantaran semula.",
		remeasureHeading: "Jika reka bentuk berubah semasa ukur semula",
		remeasure:
			"Kami memberi sebut harga baharu untuk reka bentuk yang diubah. Sebarang perbezaan dibayar balik kepada anda atau dicaj sebelum pengeluaran bermula.",
		howPaidHeading: "Cara bayaran balik dibuat",
		howPaid:
			"Bayaran balik dikembalikan ke kaedah pembayaran yang anda gunakan, dalam masa 14 hari bekerja selepas kami bersetuju dengan bayaran balik itu.",
		howToAskHeading: "Cara memohon",
		howToAsk:
			"Tulis kepada {email} dengan rujukan pesanan anda, contohnya IC-20261007-001.",
	},
	whatsapp: {
		autoReply:
			"Nombor ini hanya menghantar kemas kini pesanan EzCabinet. Untuk berbual dengan pasukan kami, hantar mesej ke {number}",
	},
	/** The shared header's account menu and the account side nav. */
	account: {
		navHeading: "Akaun anda",
		myOrders: "Pesanan saya",
		admin: "Portal admin",
		passkeys: "Kunci laluan",
		signIn: "Log masuk",
		signOut: "Log keluar",
		menuLabel: "Menu akaun",
	},
	orders: {
		heading: "Pesanan saya",
		empty: "Belum ada pesanan",
		emptyBody:
			"Apabila anda memesan reka bentuk, ia dipaparkan di sini bersama status bayaran, pengeluaran dan penghantarannya.",
		startPlanning: "Mula reka bentuk",
		statusAwaiting: "Menunggu bayaran",
		statusPaid: "Dibayar",
		statusCancelled: "Dibatalkan",
		orderedOn: "Dipesan {date}",
		unitsOne: "{room} · 1 unit",
		unitsOther: "{room} · {count} unit",
		stageNotStarted: "Belum masuk pengeluaran",
		payNow: "Bayar sekarang",
		viewOrder: "Lihat pesanan",
	},
	signIn: {
		heading: "Log masuk",
		body: "Simpan reka bentuk anda dan jejaki pesanan anda.",
		continueWithGoogle: "Teruskan dengan Google",
		error: "Tidak dapat membuka log masuk Google. Cuba lagi",
		nudge: "Disimpan pada peranti ini. Log masuk untuk membuat pesanan.",
		nudgeDismiss: "Bukan sekarang",
		back: "Kembali ke laman utama",
		privacyNote: "Dengan meneruskan, anda bersetuju dengan",
	},
	passkey: {
		heading: "Satu langkah lagi",
		enrolBody:
			"Sediakan kunci laluan supaya hanya anda boleh membuka pesanan anda. Ia menggunakan cap jari, wajah atau kunci skrin peranti ini.",
		enrolButton: "Sediakan kunci laluan",
		promptBody: "Sahkan ini anda dengan kunci laluan anda.",
		promptButton: "Guna kunci laluan",
		working: "Menunggu peranti anda…",
		failed: "Tidak berjaya. Cuba lagi",
		failedHint: "Jika ini berulang, buka halaman ini dalam Chrome atau Safari",
		wrongAccount: "Kunci laluan itu milik akaun lain",
		sessionStale:
			"Demi keselamatan anda, log masuk semula dengan Google untuk menyediakan kunci laluan",
		signInAgain: "Log masuk semula",
		unsupported:
			"Pelayar ini tidak menyokong kunci laluan. Buka halaman ini dalam Chrome atau Safari.",
		otherDevice:
			"Disediakan pada peranti lain? Pilih peranti itu apabila pelayar bertanya, atau log masuk di sana dan tambah peranti ini di bawah Kunci laluan",
		lostDevice: "Peranti hilang? Hubungi EzCabinet",
		checkoutHeading: "Satu langkah lagi sebelum membayar",
		checkoutBody:
			"Sahkan ini anda dengan kunci laluan. Ia hanya mengambil beberapa saat dan reka bentuk anda kekal seperti sedia ada.",
		checkoutButton: "Teruskan",
		listHeading: "Kunci laluan",
		listBody: "Peranti yang boleh mengesahkan ini anda.",
		unnamed: "Kunci laluan",
		added: "Ditambah {date}",
		add: "Tambah peranti lain",
		rename: "Namakan semula",
		save: "Simpan",
		cancel: "Batal",
		remove: "Buang",
		removeLast: "Anda perlukan sekurang-kurangnya satu kunci laluan",
		nameLabel: "Nama peranti",
	},
};
