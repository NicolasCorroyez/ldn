import { useEffect, useMemo, useState } from "react";
import csvContent from "../documentation/ldnbase.csv?raw";
import { auth, db } from "./lib/firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc as firestoreDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseGiftListFromCsv(rawCsv) {
  const rows = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);

  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0];
  const categories = [];

  for (let column = 0; column < headerRow.length; column += 2) {
    const title = headerRow[column];
    if (!title) {
      continue;
    }
    categories.push({ title, column, items: [] });
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    categories.forEach((category) => {
      const name = row[category.column]?.trim() ?? "";
      const extra = row[category.column + 1]?.trim() ?? "";
      if (!name) {
        return;
      }
      category.items.push({ name, extra });
    });
  }

  return categories;
}

const giftCategories = parseGiftListFromCsv(csvContent);
const participationModes = [
  { value: "virement", label: "Virement" },
  { value: "achat", label: "Achat direct" },
];

function getItemKey(categoryTitle, itemName) {
  return `${categoryTitle}::${itemName}`;
}

function getInitialParticipationDraft() {
  return { mode: "virement", amount: "", note: "" };
}

function getDefaultOfferState() {
  return { label: "A offrir", style: "bg-emerald-100 text-emerald-700" };
}

function getDisplayCategoryTitle(categoryTitle) {
  return categoryTitle
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getInitialProductDraft(item) {
  return {
    customName: item?.name ?? "",
    customLink: item?.extra?.startsWith("http") ? item.extra : "",
    description: "",
  };
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9._-]{3,30}$/.test(username);
}

function usernameToEmail(username) {
  const normalized = normalizeUsername(username);
  const configuredDomain = (
    import.meta.env.VITE_AUTH_EMAIL_DOMAIN ?? ""
  ).trim();
  const domain = configuredDomain || "example.com";
  return `${normalized}@${domain}`;
}

function getUsernameFromUser(user) {
  if (user?.displayName) {
    return user.displayName;
  }

  const email = user?.email ?? "";
  return email.split("@")[0] ?? "";
}

function groupParticipationsByGift(rows) {
  return rows.reduce((accumulator, row) => {
    const key = row.giftKey;
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(row);
    return accumulator;
  }, {});
}

function getModeLabel(mode) {
  return mode === "achat" ? "Achat direct" : "Virement";
}

function mapFirebaseError(error) {
  const code = error?.code ?? "";
  if (code === "auth/email-already-in-use") {
    return "Ce nom d'utilisateur existe deja. Utilise 'Se connecter'.";
  }
  if (code === "auth/invalid-credential") {
    return "Identifiants invalides. Verifie le nom d'utilisateur et le mot de passe.";
  }
  if (code === "auth/too-many-requests") {
    return "Trop de tentatives. Patiente quelques minutes puis reessaie.";
  }
  if (code === "permission-denied") {
    return "Acces refuse par les regles Firebase. Verifie Firestore Rules.";
  }
  return error?.message ?? "Une erreur inconnue est survenue.";
}

function App() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState("list");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [draftsByItem, setDraftsByItem] = useState({});
  const [participationsByItem, setParticipationsByItem] = useState({});
  const [productOverridesByKey, setProductOverridesByKey] = useState({});
  const [customProductsById, setCustomProductsById] = useState({});
  const [productDraftByKey, setProductDraftByKey] = useState({});
  const [savingProductKey, setSavingProductKey] = useState("");
  const [categoryAddFormOpen, setCategoryAddFormOpen] = useState("");
  const [newProductDraft, setNewProductDraft] = useState({
    name: "",
    customLink: "",
    description: "",
  });
  const [savingNewProductCategory, setSavingNewProductCategory] = useState("");
  const [participationEditsById, setParticipationEditsById] = useState({});
  const [savingParticipationId, setSavingParticipationId] = useState("");
  const [, setParticipationError] = useState("");
  const [savingItemKey, setSavingItemKey] = useState("");
  const [deletingParticipationId, setDeletingParticipationId] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        setCurrentPage("list");
        setSelectedProduct(null);
      }
      setUser(nextUser);
      setAuthError("");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const participationsQuery = query(
      collection(db, "participations"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      participationsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data(),
        }));
        setParticipationsByItem(groupParticipationsByGift(rows));
        setParticipationError("");
      },
      (error) => {
        setParticipationError(mapFirebaseError(error));
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const overridesQuery = query(collection(db, "productDetails"));
    const unsubscribe = onSnapshot(
      overridesQuery,
      (snapshot) => {
        const nextOverrides = {};
        snapshot.docs.forEach((documentSnapshot) => {
          nextOverrides[documentSnapshot.id] = documentSnapshot.data();
        });
        setProductOverridesByKey(nextOverrides);
      },
      (error) => {
        setParticipationError(mapFirebaseError(error));
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const customProductsQuery = query(collection(db, "customProducts"));

    const unsubscribe = onSnapshot(
      customProductsQuery,
      (snapshot) => {
        const nextProducts = {};
        snapshot.docs.forEach((documentSnapshot) => {
          nextProducts[documentSnapshot.id] = documentSnapshot.data();
        });
        setCustomProductsById(nextProducts);
      },
      (error) => {
        setParticipationError(mapFirebaseError(error));
      },
    );

    return () => unsubscribe();
  }, []);

  const currentUserParticipations = useMemo(() => {
    if (!user) {
      return [];
    }

    const participations = Object.entries(participationsByItem).flatMap(
      ([giftKey, rows]) =>
        rows
          .filter((row) => row.userId === user.uid)
          .map((row) => ({ ...row, giftKey })),
    );

    return participations;
  }, [participationsByItem, user]);

  const currentUserParticipationGiftKeys = useMemo(() => {
    return new Set(
      currentUserParticipations.map((participation) => participation.giftKey),
    );
  }, [currentUserParticipations]);

  const displayCategories = useMemo(() => {
    const categoriesMap = new Map();

    giftCategories.forEach((category) => {
      if (!categoriesMap.has(category.title)) {
        categoriesMap.set(category.title, []);
      }

      category.items.forEach((item) => {
        const itemKey = getItemKey(category.title, item.name);
        const override = productOverridesByKey[itemKey] ?? {};
        if (override.isHidden) {
          return;
        }

        categoriesMap.get(category.title).push({
          itemKey,
          categoryTitle: category.title,
          name: override.customName?.trim() || item.name,
          extra: override.customLink?.trim() || item.extra,
          description: override.description ?? "",
          isCustom: false,
        });
      });
    });

    Object.entries(customProductsById).forEach(([docId, product]) => {
      const categoryTitle =
        (product.categoryTitle || "Autres").trim() || "Autres";
      const itemKey = product.itemKey || `custom::${docId}`;
      const override = productOverridesByKey[itemKey] ?? {};
      if (override.isHidden) {
        return;
      }

      if (!categoriesMap.has(categoryTitle)) {
        categoriesMap.set(categoryTitle, []);
      }

      categoriesMap.get(categoryTitle).push({
        itemKey,
        categoryTitle,
        name: override.customName?.trim() || product.name || "Produit",
        extra: override.customLink?.trim() || product.customLink || "",
        description: override.description ?? product.description ?? "",
        isCustom: true,
        customDocId: docId,
      });
    });

    return Array.from(categoriesMap.entries()).map(([title, items]) => ({
      title,
      items,
    }));
  }, [customProductsById, productOverridesByKey]);

  const isAdmin = useMemo(() => {
    if (!user) {
      return false;
    }
    return normalizeUsername(getUsernameFromUser(user)) === "bagnorrez";
  }, [user]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthInfo("");

    const normalizedUsername = normalizeUsername(authUsername);
    if (!isValidUsername(normalizedUsername)) {
      setAuthError(
        "Nom d utilisateur invalide (3-30 caracteres: lettres minuscules, chiffres, point, tiret ou underscore).",
      );
      return;
    }
    if (authPassword.length < 6) {
      setAuthError("Mot de passe trop court (minimum 6 caracteres).");
      return;
    }

    setAuthLoading(true);
    const email = usernameToEmail(normalizedUsername);

    try {
      if (authMode === "signup") {
        const credentials = await createUserWithEmailAndPassword(
          auth,
          email,
          authPassword,
        );
        await updateProfile(credentials.user, {
          displayName: normalizedUsername,
        });
        await setDoc(firestoreDoc(db, "profiles", credentials.user.uid), {
          username: normalizedUsername,
          createdAt: serverTimestamp(),
        });
        setAuthInfo("Compte cree. Tu peux maintenant participer a la liste.");
      } else {
        await signInWithEmailAndPassword(auth, email, authPassword);
        setAuthInfo("Connexion reussie.");
      }

      setAuthPassword("");
    } catch (error) {
      setAuthError(mapFirebaseError(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setAuthError("");
    setAuthInfo("");
    try {
      await signOut(auth);
    } catch (error) {
      setAuthError(mapFirebaseError(error));
    }
  }

  function openProductDetail(item) {
    const itemKey = item.itemKey;
    setSelectedProduct(item);
    setCurrentPage("product");

    setDraftsByItem((previous) => {
      if (previous[itemKey]) {
        return previous;
      }
      return {
        ...previous,
        [itemKey]: getInitialParticipationDraft(),
      };
    });

    setProductDraftByKey((previous) => {
      if (previous[itemKey]) {
        return previous;
      }
      const override = productOverridesByKey[itemKey] ?? {};
      return {
        ...previous,
        [itemKey]: {
          customName: override.customName ?? item.name,
          customLink:
            override.customLink ??
            (item.extra?.startsWith("http") ? item.extra : ""),
          description: override.description ?? "",
        },
      };
    });
  }

  function updateDraft(itemKey, field, value) {
    setDraftsByItem((previous) => ({
      ...previous,
      [itemKey]: {
        ...(previous[itemKey] ?? getInitialParticipationDraft()),
        [field]: value,
      },
    }));
  }

  function updateProductDraft(itemKey, field, value) {
    setProductDraftByKey((previous) => ({
      ...previous,
      [itemKey]: {
        ...(previous[itemKey] ?? getInitialProductDraft(selectedProduct)),
        [field]: value,
      },
    }));
  }

  async function saveProductDetails(itemKey) {
    if (!isAdmin || !itemKey) {
      return;
    }

    const draft = productDraftByKey[itemKey];
    if (!draft) {
      return;
    }

    setSavingProductKey(itemKey);
    setParticipationError("");

    try {
      await setDoc(
        firestoreDoc(db, "productDetails", itemKey),
        {
          customName: draft.customName.trim(),
          customLink: draft.customLink.trim(),
          description: draft.description.trim(),
          isHidden: false,
          updatedAt: serverTimestamp(),
          updatedBy: getUsernameFromUser(user),
        },
        { merge: true },
      );

      if (selectedProduct?.itemKey === itemKey) {
        setSelectedProduct((previous) => {
          if (!previous || previous.itemKey !== itemKey) {
            return previous;
          }

          return {
            ...previous,
            name: draft.customName.trim() || previous.name,
            extra: draft.customLink.trim() || previous.extra,
            description: draft.description.trim(),
          };
        });
      }
    } catch (error) {
      setParticipationError(mapFirebaseError(error));
    } finally {
      setSavingProductKey("");
    }
  }

  function updateNewProductDraft(field, value) {
    setNewProductDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function startAddProductInCategory(categoryTitle) {
    setCategoryAddFormOpen(categoryTitle);
    setNewProductDraft({
      name: "",
      customLink: "",
      description: "",
    });
  }

  function cancelAddProductInCategory() {
    setCategoryAddFormOpen("");
    setNewProductDraft({
      name: "",
      customLink: "",
      description: "",
    });
  }

  async function createNewProduct(categoryTitle) {
    if (!isAdmin) {
      return;
    }

    const normalizedCategoryTitle = categoryTitle.trim();
    const name = newProductDraft.name.trim();
    if (!normalizedCategoryTitle || !name) {
      return;
    }

    setSavingNewProductCategory(normalizedCategoryTitle);
    setParticipationError("");

    try {
      const newDocRef = firestoreDoc(collection(db, "customProducts"));
      await setDoc(newDocRef, {
        itemKey: `custom::${newDocRef.id}`,
        categoryTitle: normalizedCategoryTitle,
        name,
        customLink: newProductDraft.customLink.trim(),
        description: newProductDraft.description.trim(),
        createdAt: serverTimestamp(),
        createdBy: getUsernameFromUser(user),
      });

      cancelAddProductInCategory();
    } catch (error) {
      setParticipationError(mapFirebaseError(error));
    } finally {
      setSavingNewProductCategory("");
    }
  }

  async function removeProduct(item) {
    if (!isAdmin || !item?.itemKey) {
      return;
    }

    setSavingProductKey(item.itemKey);
    setParticipationError("");

    try {
      if (item.isCustom && item.customDocId) {
        await deleteDoc(firestoreDoc(db, "customProducts", item.customDocId));
      }

      await setDoc(
        firestoreDoc(db, "productDetails", item.itemKey),
        {
          isHidden: true,
          updatedAt: serverTimestamp(),
          updatedBy: getUsernameFromUser(user),
        },
        { merge: true },
      );

      if (selectedProduct?.itemKey === item.itemKey) {
        setCurrentPage("list");
        setSelectedProduct(null);
      }
    } catch (error) {
      setParticipationError(mapFirebaseError(error));
    } finally {
      setSavingProductKey("");
    }
  }

  function updateParticipationEdit(participationId, field, value) {
    setParticipationEditsById((previous) => ({
      ...previous,
      [participationId]: {
        ...(previous[participationId] ?? {}),
        [field]: value,
      },
    }));
  }

  async function saveParticipationEdit(participation) {
    if (!isAdmin || !participation?.id) {
      return;
    }

    const edit = participationEditsById[participation.id] ?? {};
    setSavingParticipationId(participation.id);
    setParticipationError("");

    try {
      await updateDoc(firestoreDoc(db, "participations", participation.id), {
        mode: edit.mode ?? participation.mode,
        amount: (edit.amount ?? participation.amount ?? "").trim(),
        note: (edit.note ?? participation.note ?? "").trim(),
        updatedAt: serverTimestamp(),
        updatedBy: getUsernameFromUser(user),
      });
    } catch (error) {
      setParticipationError(mapFirebaseError(error));
    } finally {
      setSavingParticipationId("");
    }
  }

  async function submitParticipation(event, itemKey) {
    event.preventDefault();
    if (!itemKey) {
      setParticipationError("Produit introuvable.");
      return;
    }
    if (!user) {
      setParticipationError(
        "Tu dois etre connecte pour enregistrer une participation.",
      );
      return;
    }

    const draft = draftsByItem[itemKey] ?? getInitialParticipationDraft();
    setSavingItemKey(itemKey);
    setParticipationError("");

    const optimisticParticipation = {
      id: `temp-${Date.now()}`,
      giftKey: itemKey,
      mode: draft.mode,
      amount: draft.amount.trim(),
      note: draft.note.trim(),
      userId: user.uid,
      userName: getUsernameFromUser(user),
    };

    // Mise a jour optimiste: l'utilisateur voit immediatement qu'il participe.
    setParticipationsByItem((previous) => ({
      ...previous,
      [itemKey]: [...(previous[itemKey] ?? []), optimisticParticipation],
    }));

    try {
      await addDoc(collection(db, "participations"), {
        giftKey: itemKey,
        mode: draft.mode,
        amount: draft.amount.trim(),
        note: draft.note.trim(),
        userId: user.uid,
        userName: getUsernameFromUser(user),
        createdAt: serverTimestamp(),
      });

      setDraftsByItem((previous) => ({
        ...previous,
        [itemKey]: getInitialParticipationDraft(),
      }));
    } catch (error) {
      // Rollback en cas d'echec de l'ecriture distante.
      setParticipationsByItem((previous) => ({
        ...previous,
        [itemKey]: (previous[itemKey] ?? []).filter(
          (participation) => participation.id !== optimisticParticipation.id,
        ),
      }));
      setParticipationError(mapFirebaseError(error));
    } finally {
      setSavingItemKey("");
    }
  }

  async function deleteParticipation(participationId) {
    if (!user) {
      setParticipationError(
        "Tu dois etre connecte pour supprimer une participation.",
      );
      return;
    }

    let removedParticipation = null;
    let removedGiftKey = null;

    setParticipationsByItem((previous) => {
      const next = { ...previous };

      Object.entries(previous).forEach(([giftKey, rows]) => {
        const index = rows.findIndex(
          (participation) => participation.id === participationId,
        );

        if (index === -1) {
          return;
        }

        removedParticipation = rows[index];
        removedGiftKey = giftKey;

        const updatedRows = [...rows.slice(0, index), ...rows.slice(index + 1)];

        if (updatedRows.length === 0) {
          delete next[giftKey];
        } else {
          next[giftKey] = updatedRows;
        }
      });

      return next;
    });

    setDeletingParticipationId(participationId);
    setParticipationError("");

    try {
      await deleteDoc(firestoreDoc(db, "participations", participationId));
    } catch (error) {
      if (removedParticipation && removedGiftKey) {
        setParticipationsByItem((previous) => ({
          ...previous,
          [removedGiftKey]: [
            ...(previous[removedGiftKey] ?? []),
            removedParticipation,
          ],
        }));
      }
      setParticipationError(mapFirebaseError(error));
    } finally {
      setDeletingParticipationId("");
    }
  }

  const selectedProductParticipations = selectedProduct
    ? (participationsByItem[selectedProduct.itemKey] ?? [])
    : [];
  const selectedProductOverride = selectedProduct
    ? (productOverridesByKey[selectedProduct.itemKey] ?? {})
    : {};
  const selectedProductLink =
    selectedProductOverride.customLink ||
    (selectedProduct?.extra?.startsWith("http") ? selectedProduct.extra : "");
  const selectedProductDescription =
    selectedProductOverride.description ?? selectedProduct?.description ?? "";
  const selectedProductDraft = selectedProduct
    ? (draftsByItem[selectedProduct.itemKey] ?? getInitialParticipationDraft())
    : getInitialParticipationDraft();
  const selectedProductAdminDraft = selectedProduct
    ? (productDraftByKey[selectedProduct.itemKey] ??
      getInitialProductDraft(selectedProduct))
    : getInitialProductDraft(null);
  const userParticipatesSelectedProduct = Boolean(
    user &&
    selectedProduct &&
    currentUserParticipationGiftKeys.has(selectedProduct.itemKey),
  );
  const currentUserSelectedParticipation = user
    ? (selectedProductParticipations.find(
        (participation) => participation.userId === user.uid,
      ) ?? null)
    : null;

  return (
    <main className="min-h-screen bg-[#fff8e8] px-3 py-12 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl border-2 border-slate-900 bg-[#2C6AAD] p-4 shadow-[8px_8px_0_0_#111827] sm:p-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 border-dashed border-slate-300 pb-5">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-[#ff5d2e]">
              Baby list
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white">
              de Romi Corroyez
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage("list")}
              className={`rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
                currentPage === "list"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
              }`}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPage("profile");
              }}
              className={`rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
                currentPage === "profile"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
              }`}
            >
              Mon espace
            </button>
          </div>
        </header>

        {currentPage === "profile" ? (
          <section className="rounded-2xl border-2 border-slate-900 bg-[#f7f7fb] p-3 sm:p-4">
            {!user ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900">
                  Connexion / Inscription
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Connecte-toi pour acceder a ton espace personnel.
                </p>
                <form onSubmit={handleAuthSubmit} className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className={`rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-wide ${
                        authMode === "login"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Connexion
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className={`rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-wide ${
                        authMode === "signup"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Creer un compte
                    </button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={authUsername}
                      onChange={(event) => setAuthUsername(event.target.value)}
                      placeholder="Nom d utilisateur unique"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                      required
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="Mot de passe"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="rounded-full border-2 border-slate-900 bg-[#ff5d2e] px-5 py-2 text-sm font-black uppercase tracking-wide text-white hover:bg-[#ff734b] disabled:opacity-60"
                    disabled={authLoading}
                  >
                    {authLoading
                      ? "Chargement..."
                      : authMode === "signup"
                        ? "Creer le compte"
                        : "Se connecter"}
                  </button>
                </form>
                {authInfo && (
                  <p className="mt-3 text-sm font-medium text-emerald-700">
                    {authInfo}
                  </p>
                )}
              </>
            ) : currentUserParticipations.length === 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Mes participations ({currentUserParticipations.length})
                  </h2>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-full border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-black uppercase tracking-wide text-white hover:bg-slate-700"
                  >
                    Se deconnecter
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Tu n as pas encore enregistre de participation.
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Mes participations ({currentUserParticipations.length})
                  </h2>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-full border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-black uppercase tracking-wide text-white hover:bg-slate-700"
                  >
                    Se deconnecter
                  </button>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {currentUserParticipations.map((participation) => (
                    <li
                      key={participation.id}
                      className="rounded-lg bg-white px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p>
                          <span className="font-medium">
                            {participation.giftKey}
                          </span>{" "}
                          - {getModeLabel(participation.mode)}
                          {participation.amount && ` - ${participation.amount}`}
                          {participation.note && ` - ${participation.note}`}
                        </p>
                        <button
                          type="button"
                          onClick={() => deleteParticipation(participation.id)}
                          className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-60"
                          disabled={
                            deletingParticipationId === participation.id
                          }
                        >
                          {deletingParticipationId === participation.id
                            ? "Suppression..."
                            : "Supprimer"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : currentPage === "product" && selectedProduct ? (
          <section className="rounded-2xl border-2 border-slate-900 bg-[#fff5ef] p-3 sm:p-5">
            <button
              type="button"
              onClick={() => setCurrentPage("list")}
              className="mb-4 rounded-full border-2 border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-900"
            >
              ← Retour a la liste
            </button>

            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-500">
                  {getDisplayCategoryTitle(selectedProduct.categoryTitle)}
                </p>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {selectedProduct.name}
                </h2>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                  userParticipatesSelectedProduct
                    ? "bg-indigo-100 text-indigo-700"
                    : selectedProductParticipations.length > 0
                      ? "bg-emerald-100 text-emerald-700"
                      : getDefaultOfferState().style
                }`}
              >
                {userParticipatesSelectedProduct
                  ? "Vous participez"
                  : selectedProductParticipations.length > 0
                    ? "Réservé"
                    : getDefaultOfferState().label}
              </span>
            </div>

            {selectedProductLink && (
              <a
                className="mb-4 inline-block text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-2"
                href={selectedProductLink}
                target="_blank"
                rel="noreferrer"
              >
                Voir le lien produit
              </a>
            )}

            {selectedProductDescription && (
              <p className="mb-4 rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-slate-200">
                {selectedProductDescription}
              </p>
            )}

            {isAdmin && (
              <section className="mb-4 rounded-xl border border-rose-200 bg-white p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Edition admin produit
                </h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={selectedProductAdminDraft.customName ?? ""}
                    onChange={(event) =>
                      updateProductDraft(
                        selectedProduct.itemKey,
                        "customName",
                        event.target.value,
                      )
                    }
                    placeholder="Titre du produit"
                    className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                  />
                  <input
                    type="text"
                    value={selectedProductAdminDraft.customLink ?? ""}
                    onChange={(event) =>
                      updateProductDraft(
                        selectedProduct.itemKey,
                        "customLink",
                        event.target.value,
                      )
                    }
                    placeholder="Lien produit"
                    className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                  />
                  <textarea
                    value={selectedProductAdminDraft.description ?? ""}
                    onChange={(event) =>
                      updateProductDraft(
                        selectedProduct.itemKey,
                        "description",
                        event.target.value,
                      )
                    }
                    rows={3}
                    placeholder="Texte de detail produit"
                    className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => saveProductDetails(selectedProduct.itemKey)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                    disabled={savingProductKey === selectedProduct.itemKey}
                  >
                    {savingProductKey === selectedProduct.itemKey
                      ? "Sauvegarde..."
                      : "Sauvegarder le produit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeProduct(selectedProduct)}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                    disabled={savingProductKey === selectedProduct.itemKey}
                  >
                    {savingProductKey === selectedProduct.itemKey
                      ? "Suppression..."
                      : "Supprimer ce produit"}
                  </button>
                </div>
              </section>
            )}

            {!user ? (
              <p className="mb-4 text-sm text-slate-700">
                Connecte-toi pour participer a cet achat.
              </p>
            ) : userParticipatesSelectedProduct ? (
              <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-medium text-indigo-700">
                  Vous participez deja a cet achat.
                </p>
                {currentUserSelectedParticipation && (
                  <button
                    type="button"
                    onClick={() =>
                      deleteParticipation(currentUserSelectedParticipation.id)
                    }
                    className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-60"
                    disabled={
                      deletingParticipationId ===
                      currentUserSelectedParticipation.id
                    }
                  >
                    {deletingParticipationId ===
                    currentUserSelectedParticipation.id
                      ? "Suppression..."
                      : "Supprimer ma participation"}
                  </button>
                )}
              </div>
            ) : (
              <form
                onSubmit={(event) =>
                  submitParticipation(event, selectedProduct.itemKey)
                }
                className="mb-4 space-y-2 rounded-xl border border-rose-100 bg-white p-3"
              >
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedProductDraft.mode}
                    onChange={(event) =>
                      updateDraft(
                        selectedProduct.itemKey,
                        "mode",
                        event.target.value,
                      )
                    }
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 focus:ring-2"
                  >
                    {participationModes.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={selectedProductDraft.amount}
                    onChange={(event) =>
                      updateDraft(
                        selectedProduct.itemKey,
                        "amount",
                        event.target.value,
                      )
                    }
                    placeholder="Montant (optionnel)"
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                  />
                </div>

                <textarea
                  value={selectedProductDraft.note}
                  onChange={(event) =>
                    updateDraft(
                      selectedProduct.itemKey,
                      "note",
                      event.target.value,
                    )
                  }
                  rows={2}
                  placeholder="Message (optionnel)"
                  className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                />

                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                  disabled={savingItemKey === selectedProduct.itemKey}
                >
                  {savingItemKey === selectedProduct.itemKey
                    ? "Enregistrement..."
                    : "Enregistrer ma participation"}
                </button>
              </form>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Participants
              </p>
              {selectedProductParticipations.length === 0 ? (
                <p className="text-sm text-slate-600">
                  Pas encore de participation enregistree.
                </p>
              ) : (
                <ul className="space-y-2 text-sm text-slate-700">
                  {selectedProductParticipations.map((participation) => (
                    <li
                      key={participation.id}
                      className="rounded-lg bg-white px-2 py-1"
                    >
                      {!isAdmin ? (
                        <>
                          <span className="font-medium">
                            {participation.userName}
                          </span>{" "}
                          - {getModeLabel(participation.mode)}
                          {participation.amount && ` - ${participation.amount}`}
                          {participation.note && ` - ${participation.note}`}
                        </>
                      ) : (
                        <div className="space-y-2 py-1">
                          <p className="text-sm font-medium text-slate-800">
                            {participation.userName}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={
                                participationEditsById[participation.id]
                                  ?.mode ?? participation.mode
                              }
                              onChange={(event) =>
                                updateParticipationEdit(
                                  participation.id,
                                  "mode",
                                  event.target.value,
                                )
                              }
                              className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs outline-none ring-rose-300 focus:ring-2"
                            >
                              {participationModes.map((mode) => (
                                <option key={mode.value} value={mode.value}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={
                                participationEditsById[participation.id]
                                  ?.amount ??
                                participation.amount ??
                                ""
                              }
                              onChange={(event) =>
                                updateParticipationEdit(
                                  participation.id,
                                  "amount",
                                  event.target.value,
                                )
                              }
                              placeholder="Montant"
                              className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                saveParticipationEdit(participation)
                              }
                              className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                              disabled={
                                savingParticipationId === participation.id
                              }
                            >
                              {savingParticipationId === participation.id
                                ? "..."
                                : "Sauver"}
                            </button>
                          </div>
                          <textarea
                            value={
                              participationEditsById[participation.id]?.note ??
                              participation.note ??
                              ""
                            }
                            onChange={(event) =>
                              updateParticipationEdit(
                                participation.id,
                                "note",
                                event.target.value,
                              )
                            }
                            rows={2}
                            placeholder="Note"
                            className="w-full rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              deleteParticipation(participation.id)
                            }
                            className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-60"
                            disabled={
                              deletingParticipationId === participation.id
                            }
                          >
                            {deletingParticipationId === participation.id
                              ? "Suppression..."
                              : "Supprimer"}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {displayCategories.map((category) => (
                <article
                  key={category.title}
                  className="rounded-2xl border-2 border-slate-900 bg-[#f4f4f4] p-3 shadow-[3px_3px_0_0_#111827] sm:p-5"
                >
                  <h2 className="mb-4 text-xl font-black uppercase tracking-wide text-slate-900">
                    {getDisplayCategoryTitle(category.title)}
                  </h2>
                  <ul className="space-y-3">
                    {category.items.map((item) => {
                      const itemKey = item.itemKey;
                      const hasParticipation =
                        (participationsByItem[itemKey] ?? []).length > 0;
                      const userParticipates =
                        user && currentUserParticipationGiftKeys.has(itemKey);
                      const state = userParticipates
                        ? {
                            label: "Vous participez",
                            style: "bg-indigo-100 text-indigo-700",
                          }
                        : hasParticipation
                          ? {
                              label: "Réservé",
                              style: "bg-rose-100 text-rose-700",
                            }
                          : getDefaultOfferState();

                      return (
                        <li key={item.itemKey}>
                          <button
                            type="button"
                            onClick={() => openProductDetail(item)}
                            className="w-full rounded-xl border-2 border-slate-900 bg-[#ffffff] p-3 text-left shadow-[2px_2px_0_0_#111827] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#111827] focus:outline-none focus:ring-2 focus:ring-rose-300"
                          >
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-slate-800">
                                {item.name}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${state.style}`}
                              >
                                {state.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Cliquer pour voir le detail du produit
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {isAdmin && (
                    <div className="mt-4 border-t-2 border-dashed border-rose-200 pt-3">
                      {categoryAddFormOpen === category.title ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newProductDraft.name}
                            onChange={(event) =>
                              updateNewProductDraft("name", event.target.value)
                            }
                            placeholder="Nom du produit"
                            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                          />
                          <input
                            type="text"
                            value={newProductDraft.customLink}
                            onChange={(event) =>
                              updateNewProductDraft(
                                "customLink",
                                event.target.value,
                              )
                            }
                            placeholder="Lien (optionnel)"
                            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                          />
                          <textarea
                            value={newProductDraft.description}
                            onChange={(event) =>
                              updateNewProductDraft(
                                "description",
                                event.target.value,
                              )
                            }
                            rows={2}
                            placeholder="Texte detail (optionnel)"
                            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => createNewProduct(category.title)}
                              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                              disabled={
                                savingNewProductCategory === category.title ||
                                !newProductDraft.name.trim()
                              }
                            >
                              {savingNewProductCategory === category.title
                                ? "Ajout..."
                                : !newProductDraft.name.trim()
                                  ? "Nom requis"
                                  : "Valider l'ajout"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelAddProductInCategory}
                              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            startAddProductInCategory(category.title)
                          }
                          className="w-full rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-rose-200 hover:bg-rose-100"
                        >
                          + Ajouter un produit dans{" "}
                          {getDisplayCategoryTitle(category.title)}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
