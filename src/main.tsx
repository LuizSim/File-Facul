import './style.css'
import { supabase } from './supabaseClient'
import type { AuthSession } from '@supabase/supabase-js'
import { handleCreateFolder, deleteFolderAndContents, renameFolder } from './folders';
import { initializeBoard } from './board';
import { initializeAliss } from './Aliss';

interface Folder {
  id: string;
  created_at: string;
  name: string;
  owner_id: string;
  parent_folder_id: string | null;
  item_type: 'folder';
}

interface FileItemDB {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  uploader_id: string;
  folder_id: string | null;
  item_type: 'file';
  profiles?: { full_name: string | null } | null;
}

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getIconForItem(item: Folder | FileItemDB): string {
  if (item.item_type === 'folder') {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="#facc15" viewBox="0 0 24 24" stroke-width="1.5" stroke="#eab308"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>`;
  }
  const extension = item.file_name.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'zip': case 'rar': case '7z':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#0c2950" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>`;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'avif':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#0c2950" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.174 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>`;
    case 'dwg':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#0c2950" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75v6.75m0 0l-3-3m3 3l3-3m-8.25 6a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>`;
    case 'html': case 'css': case 'js': case 'ts': case 'tsx': case 'jsx': case 'json': case 'c': case 'cpp': case 'cs':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#fffeec" viewBox="0 0 24 24" stroke-width="1.5" stroke="#0c2950"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#0c2950" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`;
  }
}

function sanitizeFileName(name: string): string {
  const extension = name.split('.').pop() || '';
  const nameWithoutExtension = name.substring(0, name.lastIndexOf('.')) || name;

  const sanitized = nameWithoutExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/\s+/g, '_');

  return `${sanitized}.${extension}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const initialLoadingOverlay = document.querySelector<HTMLDivElement>('#initial-loading-overlay')!;
  const appElement = document.querySelector<HTMLDivElement>('#app')!;
  const authView = document.querySelector<HTMLDivElement>('#auth-view')!;
  const loggedInView = document.querySelector<HTMLDivElement>('#logged-in-view')!;
  const loginContainer = document.querySelector<HTMLDivElement>('#login-container')!;
  const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
  const showSignupViewButton = document.querySelector<HTMLButtonElement>('#show-signup-view-button')!;
  const signupContainer = document.querySelector<HTMLDivElement>('#signup-container')!;
  const signupForm = document.querySelector<HTMLFormElement>('#signup-form')!;
  const showLoginViewButton = document.querySelector<HTMLButtonElement>('#show-login-view-button')!;
  const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;
  const userInfo = document.querySelector<HTMLParagraphElement>('#user-info')!;
  const uploadForm = document.querySelector<HTMLFormElement>('#upload-form')!;
  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  const fileList = document.querySelector<HTMLDivElement>('#file-list')!;
  const appMessageContainer = document.querySelector<HTMLDivElement>('#app-message-container')!;
  const appMessageText = document.querySelector<HTMLParagraphElement>('#app-message-text')!;
  const loadingOverlay = document.querySelector<HTMLDivElement>('#loading-overlay')!;
  const loadingOverlayText = loadingOverlay ? loadingOverlay.querySelector('p') : null;
  const confirmModalOverlay = document.querySelector<HTMLDivElement>('#confirm-modal-overlay')!;
  const confirmModalMessage = document.querySelector<HTMLParagraphElement>('#confirm-modal-message')!;
  const confirmModalYesButton = document.querySelector<HTMLButtonElement>('#confirm-modal-yes-button')!;
  const confirmModalNoButton = document.querySelector<HTMLButtonElement>('#confirm-modal-no-button')!;
  const createFolderForm = document.querySelector<HTMLFormElement>('#create-folder-form')!;
  const folderNameInput = document.querySelector<HTMLInputElement>('#folder-name-input')!;
  const folderNavigationControls = document.querySelector<HTMLDivElement>('#folder-navigation-controls')!;
  const fileInputLabel = document.querySelector<HTMLLabelElement>('#file-input-label')!;
  const fileInputText = document.querySelector<HTMLSpanElement>('#file-input-text')!;
  const iconAddFile = document.querySelector<SVGElement>('#icon-add-file')!;
  const iconFileSelected = document.querySelector<SVGElement>('#icon-file-selected')!;
  const showBoardBtn = document.getElementById('show-board-btn') as HTMLButtonElement;
  const backToFilesBtn = document.getElementById('back-to-files-btn') as HTMLButtonElement;
  const boardView = document.getElementById('board-view') as HTMLElement;
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const headerMenu = document.getElementById('header-menu');
  const alissBtn = document.getElementById('aliss-btn') as HTMLButtonElement;
  const alissView = document.getElementById('aliss-view') as HTMLElement;
  const backFromAlissBtn = document.getElementById('back-to-files-from-aliss-btn') as HTMLButtonElement;
  const storageInfo = document.querySelector<HTMLParagraphElement>('#storage-info')!;
  const uploadButton = document.querySelector<HTMLButtonElement>('#upload-button')!;

  setTimeout(() => {
    if (initialLoadingOverlay) {
      initialLoadingOverlay.classList.add('hidden');
    }
  }, 2000);

  const elementsToVerify = [
    { name: 'initialLoadingOverlay', element: initialLoadingOverlay },
    { name: 'appElement', element: appElement },
    { name: 'authView', element: authView },
    { name: 'loggedInView', element: loggedInView },
    { name: 'loginContainer', element: loginContainer },
    { name: 'loginForm', element: loginForm },
    { name: 'showSignupViewButton', element: showSignupViewButton },
    { name: 'signupContainer', element: signupContainer },
    { name: 'signupForm', element: signupForm },
    { name: 'showLoginViewButton', element: showLoginViewButton },
    { name: 'logoutButton', element: logoutButton },
    { name: 'userInfo', element: userInfo },
    { name: 'uploadForm', element: uploadForm },
    { name: 'fileInput', element: fileInput },
    { name: 'fileList', element: fileList },
    { name: 'appMessageContainer', element: appMessageContainer },
    { name: 'appMessageText', element: appMessageText },
    { name: 'loadingOverlay', element: loadingOverlay },
    { name: 'loadingOverlayText', element: loadingOverlayText },
    { name: 'confirmModalOverlay', element: confirmModalOverlay },
    { name: 'confirmModalMessage', element: confirmModalMessage },
    { name: 'confirmModalYesButton', element: confirmModalYesButton },
    { name: 'confirmModalNoButton', element: confirmModalNoButton },
    { name: 'createFolderForm', element: createFolderForm },
    { name: 'folderNameInput', element: folderNameInput },
    { name: 'folderNavigationControls', element: folderNavigationControls },
    { name: 'fileInputLabel', element: fileInputLabel },
    { name: 'fileInputText', element: fileInputText },
    { name: 'iconAddFile', element: iconAddFile },
    { name: 'iconFileSelected', element: iconFileSelected },
  ];

  async function updateStorageUsage() {
    if (!storageInfo) return;

    try {
      const { data, error } = await supabase.rpc('get_total_storage_size');

      if (error) throw error;

      const totalSize = data || 0;
      const totalStorage = 1 * 1024 * 1024 * 1024;
      const percentageUsed = (totalSize / totalStorage) * 100;

      storageInfo.innerHTML = `
            Armazenamento: <strong>${formatBytes(totalSize)}</strong>
            (${percentageUsed.toFixed(2)}%)
        `;

    } catch (error) {
      console.error("Erro ao calcular o uso do armazenamento via RPC:", error);
      storageInfo.textContent = "Não foi possível carregar o uso do armazenamento.";
    }
  }

  let isAlissInitialized = false;

  let allElementsFound = true;
  for (const item of elementsToVerify) {
    if (!item.element) {
      console.error(`ERRO CRÍTICO: O elemento para "${item.name}" não foi encontrado! Verifique o seletor no main.tsx ou o ID correspondente no index.html.`);
      allElementsFound = false;
    }
  }

  if (!allElementsFound) {
    return;
  }

  let isBoardInitialized = false;

  const showFiles = () => {
    boardView.classList.add('board-hidden');
    alissView.classList.add('view-hidden');
    appElement.classList.remove('app-hidden');
  };

  const showBoard = () => {
    if (!isBoardInitialized) {
      initializeBoard(session);
      isBoardInitialized = true;
    }
    appElement.classList.add('app-hidden');
    alissView.classList.add('view-hidden');
    boardView.classList.remove('board-hidden');
  };

  const showAlissView = () => {
    const alissSplashScreen = document.getElementById('aliss-splash-screen') as HTMLElement;
    const splashText = alissSplashScreen.querySelector('.splash-text') as HTMLElement;
    const alissContainer = alissView.querySelector('.aliss-container') as HTMLElement;

    if (!alissView || !alissSplashScreen || !alissContainer || !splashText) return;
    alissContainer.classList.add('hidden');
    alissSplashScreen.classList.remove('hidden');
    splashText.classList.remove('start-animation');
    alissView.classList.remove('view-hidden');
    appElement.classList.add('app-hidden');
    boardView.classList.add('board-hidden');

    setTimeout(() => {
      splashText.classList.add('start-animation');
    }, 20);

    setTimeout(() => {
      alissSplashScreen.classList.add('hidden');
      alissContainer.classList.remove('hidden');

      if (!isAlissInitialized) {
        initializeAliss(session);
        isAlissInitialized = true;
      }
    }, 3000);
  };

  if (showBoardBtn) showBoardBtn.addEventListener('click', showBoard);
  if (backToFilesBtn) backToFilesBtn.addEventListener('click', showFiles);
  if (alissBtn) alissBtn.addEventListener('click', showAlissView);
  if (backFromAlissBtn) backFromAlissBtn.addEventListener('click', showFiles);

  if (menuToggleBtn && headerMenu) {
    menuToggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      headerMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
      if (!headerMenu.classList.contains('hidden') && !menuToggleBtn.contains(event.target as Node)) {
        headerMenu.classList.add('hidden');
      }
    });
  }

  let session: AuthSession | null = null;
  let appMessageTimeoutId: number | null = null;
  let currentFolderId: string | null = null;
  let pressTimer: number | null = null;

  function showTimedLoader(text: string, duration: number = 3000) {
    if (loadingOverlayText) loadingOverlayText.textContent = text;
    loadingOverlay.classList.add('visible');

    setTimeout(() => {
      loadingOverlay.classList.remove('visible');
    }, duration);
  }

  function showAppMessage(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) {
    if (appMessageTimeoutId) clearTimeout(appMessageTimeoutId);
    appMessageText.textContent = message;
    appMessageContainer.className = 'app-message-container';
    appMessageContainer.classList.add(type);
    appMessageContainer.style.display = 'block';
    appMessageTimeoutId = window.setTimeout(() => {
      appMessageContainer.style.display = 'none';
    }, duration);
  }

  function showLoading(text: string = "Processando, aguarde...") {
    if (loadingOverlayText) loadingOverlayText.textContent = text;
    loadingOverlay.classList.add('visible');
    appElement.classList.add('app-blurred');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('visible');
    if (confirmModalOverlay.classList.contains('visible') === false) {
      appElement.classList.remove('app-blurred');
    }
  }

  function showCustomConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-modal-overlay');
      const messageElem = document.getElementById('confirm-modal-message');
      const yesBtn = document.getElementById('confirm-modal-yes-button');
      const noBtn = document.getElementById('confirm-modal-no-button');

      if (!overlay || !messageElem || !yesBtn || !noBtn) {
        console.error('Erro: Elementos do modal de confirmação não encontrados.');
        resolve(false);
        return;
      }

      messageElem.textContent = message;
      overlay.classList.add('visible');

      function cleanup(result: boolean) {
        overlay!.classList.remove('visible');
        yesBtn!.removeEventListener('click', onYes);
        noBtn!.removeEventListener('click', onNo);
        resolve(result);
      }
      function onYes() { cleanup(true); }
      function onNo() { cleanup(false); }

      yesBtn!.addEventListener('click', onYes);
      noBtn!.addEventListener('click', onNo);
    });
  }

  function resetFileInputLabel() {
    fileInputText.textContent = 'Escolher arquivo...';
    fileInputLabel.classList.remove('file-selected');
    iconAddFile.style.display = 'block';
    iconFileSelected.style.display = 'none';
    fileInput.value = '';
  }

  function updateView() {
    if (session) {
      authView.classList.add('view-hidden');
      loggedInView.classList.remove('view-hidden');

      userInfo.textContent = ` ${session.user.user_metadata.username || session.user.email}`;
      displayItemsInCurrentFolder(currentFolderId);
    } else {
      authView.classList.remove('view-hidden');
      loggedInView.classList.add('view-hidden');

      currentFolderId = null;
    }
  }

  async function displayItemsInCurrentFolder(folderIdToDisplay: string | null) {
    if (!session?.user) return;
    showLoading("Carregando itens...");
    currentFolderId = folderIdToDisplay;
    folderNavigationControls.innerHTML = '';

    if (currentFolderId !== null) {
      let currentPathDisplay = "Pasta Atual";
      const { data: currentFolderData, error: folderDataError } = await supabase
        .from('folders').select('name, parent_folder_id').eq('id', currentFolderId).single();
      if (folderDataError) { console.error("Erro ao buscar dados da pasta atual:", folderDataError); showAppMessage("Erro.", 'error'); }

      const backButton = document.createElement('button'); backButton.className = 'back-button';
      const parentIdOfCurrent = currentFolderData?.parent_folder_id;
      backButton.textContent = '⬅️ Voltar';
      backButton.onclick = () => { displayItemsInCurrentFolder(parentIdOfCurrent); };
      folderNavigationControls.appendChild(backButton);

      if (currentFolderData) { currentPathDisplay = `${currentFolderData.name}`; }
      else { currentPathDisplay = `Pasta Desconhecida`; }

      const pathSpan = document.createElement('span');
      pathSpan.textContent = `  Visualizando: ${currentPathDisplay}`;
      pathSpan.style.marginLeft = "10px";
      pathSpan.style.fontStyle = "italic";
      folderNavigationControls.appendChild(pathSpan);
    }

    try {
      let foldersQuery = supabase.from('folders').select('*');
      if (folderIdToDisplay === null) {
        foldersQuery = foldersQuery.is('parent_folder_id', null);
      } else {
        foldersQuery = foldersQuery.eq('parent_folder_id', folderIdToDisplay);
      }
      const { data: foldersData, error: foldersError } = await foldersQuery.order('name', { ascending: true });
      if (foldersError) throw foldersError;

      let filesQuery = supabase.from('files').select('*');
      if (folderIdToDisplay === null) {
        filesQuery = filesQuery.is('folder_id', null);
      } else {
        filesQuery = filesQuery.eq('folder_id', folderIdToDisplay);
      }
      const { data: filesData, error: filesError } = await filesQuery.order('created_at', { ascending: false });
      if (filesError) throw filesError;

      const fetchedFolders: Folder[] = foldersData?.map((f: any) => ({ ...f, item_type: 'folder' as const })) || [];
      const fetchedFiles: FileItemDB[] = filesData?.map((f: any) => ({ ...f, item_type: 'file' as const })) || [];

      const fileUploaderIds = fetchedFiles.map((file: FileItemDB) => file.uploader_id).filter((id: string | null): id is string => id !== null);
      const folderOwnerIds = fetchedFolders.map((folder: Folder) => folder.owner_id).filter((id: string | null): id is string => id !== null);
      const allUserIdsToFetch = [...new Set([...fileUploaderIds, ...folderOwnerIds])];

      let profilesMap = new Map<string, { full_name: string | null }>();
      if (allUserIdsToFetch.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles').select('id, full_name').in('id', allUserIdsToFetch);
        if (profilesError) console.error('Erro ao buscar perfis:', profilesError);
        else if (profilesData) profilesData.forEach(p => profilesMap.set(p.id, { full_name: p.full_name }));
      }

      const items: (Folder | FileItemDB)[] = [...fetchedFolders, ...fetchedFiles].sort((a, b) => {
        if (a.item_type === 'folder' && b.item_type === 'file') return -1;
        if (a.item_type === 'file' && b.item_type === 'folder') return 1;
        const nameA = a.item_type === 'folder' ? a.name : a.file_name;
        const nameB = b.item_type === 'folder' ? b.name : b.file_name;
        return nameA.localeCompare(nameB);
      });

      fileList.innerHTML = '';
      if (items.length === 0) { fileList.innerHTML = currentFolderId ? '<p>Esta pasta está vazia.</p>' : '<p>Nenhum item na raiz.</p>'; }

      const currentLoggedInUserId = session!.user.id;

      items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'file-item';

        const itemName = item.item_type === 'folder' ? item.name : item.file_name;
        const iconHtml = getIconForItem(item);

        if (item.item_type === 'folder') {
          itemDiv.classList.add('folder-item');
          itemDiv.dataset.folderId = String(item.id);
          itemDiv.dataset.folderName = item.name;
          itemDiv.dataset.ownerId = item.owner_id;

          itemDiv.innerHTML = `
            <div class="item-icon">${iconHtml}</div>
            <div class="file-info">
              <span class="folder-name-display item-name" title="${itemName}">${itemName}</span>
              <form class="rename-form" style="display:none;">
                <input type="text" value="${itemName}" maxlength="60" required />
                <button type="submit" title="Salvar">✔️</button>
                <button type="button" class="cancel-rename-button" title="Cancelar">✖️</button>
              </form>
            </div>
            <div class="file-actions"></div>
          `;

        } else {
          itemDiv.dataset.uploaderId = item.uploader_id;
          itemDiv.dataset.storagePath = item.storage_path;
          itemDiv.dataset.fileId = item.id;

          const uploaderName = profilesMap.get(item.uploader_id)?.full_name || 'Desconhecido';

          itemDiv.innerHTML = `
          <div class="item-icon">${iconHtml}</div>
          <span class="item-name" title="${itemName}">${itemName}</span>
          <span class="uploader-name" title="Enviado por: ${uploaderName}">por: ${uploaderName}</span>
          <div class="file-actions"></div>`;

          const actionsDiv = itemDiv.querySelector('.file-actions')!;
          if (item.item_type === 'file') {
            const { data: publicUrlData } = supabase.storage.from('files').getPublicUrl(item.storage_path);
            const downloadLink = document.createElement('a');
            downloadLink.href = publicUrlData.publicUrl;
            downloadLink.className = 'download-button';
            downloadLink.title = 'Baixar';
            downloadLink.target = '_blank';
            downloadLink.download = item.file_name;
            downloadLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`;
            actionsDiv.appendChild(downloadLink);

            const isOwner = currentLoggedInUserId === item.uploader_id;
            if (isOwner) {
              const deleteFileBtn = document.createElement('button');
              deleteFileBtn.className = 'excluir';
              deleteFileBtn.title = 'Deletar arquivo';
              deleteFileBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
              actionsDiv.appendChild(deleteFileBtn);
              deleteFileBtn.style.borderRadius = '4px';
              deleteFileBtn.style.padding = '4px 10px';
              deleteFileBtn.style.background = '#ef4444';
              deleteFileBtn.style.color = '#fff';
              deleteFileBtn.style.border = 'none';
              deleteFileBtn.style.marginLeft = '6px';
              deleteFileBtn.style.display = 'inline-flex';
              deleteFileBtn.style.alignItems = 'center';
              deleteFileBtn.style.gap = '4px';
              deleteFileBtn.style.transition = 'background 0.2s';
              deleteFileBtn.onmouseover = () => { deleteFileBtn.style.background = '#dc2626'; };
              deleteFileBtn.onmouseout = () => { deleteFileBtn.style.background = '#ef4444'; };
              deleteFileBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const confirmed = await showCustomConfirm('Tem certeza que deseja deletar este ARQUIVO? Esta ação é irreversível.');
                if (confirmed) {
                  await handleDeleteFile(item.id, item.storage_path);
                }
              });
            }
          }
        }

        const isOwner = currentLoggedInUserId === (item.item_type === 'folder' ? item.owner_id : item.uploader_id);

        if (isOwner) {
          const actionsDiv = itemDiv.querySelector('.file-actions')!;
          if (item.item_type === 'folder') {
            const renameBtn = document.createElement('button');
            renameBtn.className = 'rename-folder-button';
            renameBtn.title = 'Renomear';
            renameBtn.dataset.folderId = String(item.id);
            renameBtn.dataset.currentName = item.name;
            renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="75" height="75" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>`;
            renameBtn.style.borderRadius = '4px';
            renameBtn.style.padding = '8px 18px';
            renameBtn.style.background = '#22c55e';
            renameBtn.style.color = '#fff';
            renameBtn.style.border = 'none';
            renameBtn.style.marginLeft = '8px';
            renameBtn.style.display = 'inline-flex';
            renameBtn.style.alignItems = 'center';
            renameBtn.style.gap = '6px';
            renameBtn.style.transition = 'background 0.2s';
            renameBtn.style.boxShadow = 'none';
            renameBtn.style.height = '11vw';
            renameBtn.style.minWidth = '21vw';
            renameBtn.onmouseover = () => { renameBtn.style.background = '#16a34a'; };
            renameBtn.onmouseout = () => { renameBtn.style.background = '#22c55e'; };
            const svg = renameBtn.querySelector('svg');
            if (svg) {
              svg.setAttribute('width', '50');
              svg.setAttribute('height', '50');
              svg.style.display = 'inline-block';
              svg.style.verticalAlign = 'middle';
            }
            actionsDiv.appendChild(renameBtn);
          }

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'delete-button';
          deleteBtn.title = 'Deletar';
          if (item.item_type === 'folder') {
            deleteBtn.dataset.folderId = String(item.id);
          } else {
            deleteBtn.dataset.fileId = String(item.id);
            deleteBtn.dataset.storagePath = item.storage_path;
          }
          deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
          actionsDiv.appendChild(deleteBtn);
        }

        const actionsDiv = itemDiv.querySelector('.file-actions')!;
        const deleteBtnEl = actionsDiv.querySelector('.delete-button') as HTMLButtonElement | null;
        if (deleteBtnEl) {
          deleteBtnEl.style.borderRadius = '4px';
          deleteBtnEl.style.padding = '4px 10px';
          deleteBtnEl.style.background = '#ef4444';
          deleteBtnEl.style.color = '#fff';
          deleteBtnEl.style.border = 'none';
          deleteBtnEl.style.marginLeft = '6px';
          deleteBtnEl.style.display = 'inline-flex';
          deleteBtnEl.style.alignItems = 'center';
          deleteBtnEl.style.gap = '4px';
          deleteBtnEl.style.transition = 'background 0.2s';
          deleteBtnEl.onmouseover = () => { deleteBtnEl.style.background = '#dc2626'; };
          deleteBtnEl.onmouseout = () => { deleteBtnEl.style.background = '#ef4444'; };
          const svg = deleteBtnEl.querySelector('svg');
          if (svg) {
            svg.setAttribute('width', '28');
            svg.setAttribute('height', '28');
            svg.style.display = 'inline-block';
            svg.style.verticalAlign = 'middle';
          }
        }

        fileList.appendChild(itemDiv);
      });

    } catch (error: any) {
      console.error("Erro geral ao exibir itens:", error);
      if (fileList) fileList.innerHTML = '<p id="file-list-error">Erro ao carregar, verifique sua internet.</p>';
    } finally { hideLoading(); }
    updateStorageUsage();
  }

  async function handleUpload(event: Event) {
    event.preventDefault();

    const files = fileInput!.files;
    if (!files || files.length === 0 || !session) {
      showAppMessage('Por favor, selecione um ou mais arquivos.', 'error');
      return;
    }

    uploadButton.disabled = true;
    fileInput.disabled = true;
    uploadButton.innerHTML = `<span>Enviando ${files.length} arquivo(s)...</span>`;

    showTimedLoader(`Enviando ${files.length} arquivo(s)...`, 3000);

    let allUploadsSuccessful = true;

    for (const file of files) {
      const sanitizedOriginalName = sanitizeFileName(file.name);
      const storageFolderPrefix = currentFolderId ? `${session.user.id}/${currentFolderId}` : `${session.user.id}/root`;
      const storagePath = `${storageFolderPrefix}/${Date.now()}_${sanitizedOriginalName}`;

      try {
        const { error: uploadError } = await supabase.storage.from('files').upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from('files').insert({
          file_name: file.name,
          file_type: file.type,
          storage_path: storagePath,
          uploader_id: session.user.id,
          folder_id: currentFolderId
        });
        if (insertError) throw insertError;

      } catch (e: any) {
        allUploadsSuccessful = false;
        console.error(`Falha no upload de ${file.name}:`, e);
        showAppMessage(`Falha no upload de ${file.name}: ${e.message}`, 'error');
        break;
      }
    }

    uploadButton.disabled = false;
    fileInput.disabled = false;
    uploadButton.innerHTML = `<svg>...</svg><span>Enviar Arquivo</span>`;

    if (allUploadsSuccessful) {
      showAppMessage('Upload(s) concluído(s) com sucesso!', 'success');
    }

    uploadForm!.reset();
    resetFileInputLabel();
    displayItemsInCurrentFolder(currentFolderId);
    updateStorageUsage();
  }

  async function handleAttemptDeleteFolder(folderId: string) {
    if (!session?.user) return;
    const currentUserId = session.user.id;
    showLoading("Verificando conteúdo da pasta...");
    let nonOwnedFilesExist = false;
    let containsSubfoldersOrFiles = false;
    try {
      const { data: filesInFolder, error: filesError } = await supabase
        .from('files').select('uploader_id').eq('folder_id', folderId);
      if (filesError) throw filesError;
      if (filesInFolder && filesInFolder.length > 0) {
        containsSubfoldersOrFiles = true;
        if (filesInFolder.some(file => file.uploader_id !== currentUserId)) {
          nonOwnedFilesExist = true;
        }
      }
      const { count: subfolderCount, error: subfoldersError } = await supabase
        .from('folders').select('*', { count: 'exact', head: true }).eq('parent_folder_id', folderId);
      if (subfoldersError) throw subfoldersError;
      if (subfolderCount && subfolderCount > 0) {
        containsSubfoldersOrFiles = true;
      }
    } catch (error: any) {
      hideLoading();
      showAppMessage(`Erro ao verificar conteúdo da pasta: ${error.message}`, 'error');
      return;
    } finally {
      if (loadingOverlayText && loadingOverlayText.textContent === "Verificando conteúdo da pasta...") {
        hideLoading();
      }
    }
    let confirmMessage = `Deletar esta pasta${containsSubfoldersOrFiles ? ' e TODO o seu conteúdo' : ''}? Esta ação não pode ser desfeita.`;
    if (nonOwnedFilesExist) {
      confirmMessage = `Esta pasta contém arquivos que não foram criados por você. Ao deletar, seus arquivos e todas as subpastas serão removidos, e os arquivos de outros usuários serão movidos para a "Central de Arquivos" (raiz). Deseja continuar?`;
    }
    const confirmed = await showCustomConfirm(confirmMessage);
    if (!confirmed) return;
    showLoading("Deletando pasta e conteúdo...");
    const result = await deleteFolderAndContents(folderId);
    hideLoading();
    if (result.success) {
      showAppMessage('Pasta processada com sucesso!', 'success');
      if (currentFolderId === folderId) {
        displayItemsInCurrentFolder(null);
      } else {
        displayItemsInCurrentFolder(currentFolderId);
      }
    } else {
      showAppMessage(`Falha ao deletar pasta: ${result.error || 'Erro desconhecido'}`, 'error');
    }
  }

  async function handleAttemptRenameFolder(folderId: string, newName: string, formElement: HTMLFormElement) {
    showLoading("Renomeando pasta...");
    const result = await renameFolder(folderId, newName);
    hideLoading();
    if (result.success) {
      showAppMessage("Pasta renomeada com sucesso!", "success");
      displayItemsInCurrentFolder(currentFolderId);
    } else {
      showAppMessage(`Erro ao renomear: ${result.error || 'Erro desconhecido'}`, 'error');
      const itemDiv = formElement.closest('.file-item');
      const nameSpan = itemDiv?.querySelector('.folder-name-display') as HTMLElement;
      if (itemDiv && nameSpan) {
        itemDiv.classList.remove('is-renaming');
        formElement.style.display = 'none';
        nameSpan.style.display = 'block';
      }
    }
  }

  async function handleDeleteFile(fileId: string, storagePath: string) {
    showLoading("Deletando arquivo...");
    try {
      const { error: storageError } = await supabase.storage.from('files').remove([storagePath]);
      if (storageError) throw storageError;
      const { error: dbError } = await supabase.from('files').delete().eq('id', fileId);
      if (dbError) throw dbError;
      showAppMessage('Arquivo deletado!', 'success');
      displayItemsInCurrentFolder(currentFolderId);
    } catch (e: any) {
      console.error('Erro ao deletar arquivo:', e);
      showAppMessage(`Falha ao deletar: ${e.message}`, 'error');
    } finally {
      hideLoading();
    }
  }

  showSignupViewButton.addEventListener('click', (_event) => {
    if (loginContainer && signupContainer) { loginContainer.style.display = 'none'; signupContainer.style.display = 'block'; }
  });
  showLoginViewButton.addEventListener('click', (_event) => {
    if (loginContainer && signupContainer) { loginContainer.style.display = 'block'; signupContainer.style.display = 'none'; }
  });
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = (loginForm.elements.namedItem('login-username') as HTMLInputElement).value;
    const password = (loginForm.elements.namedItem('login-password') as HTMLInputElement).value;
    const fakeEmail = `${username.toLowerCase()}@filefacul.local`;
    const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
    if (error) { showAppMessage('Nome de usuário ou senha inválidos.', 'error'); }
  });
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = (signupForm.elements.namedItem('signup-name') as HTMLInputElement).value;
    const username = (signupForm.elements.namedItem('signup-username') as HTMLInputElement).value.toLowerCase();
    const password = (signupForm.elements.namedItem('signup-password') as HTMLInputElement).value;
    if (!fullName || !username || !password) { showAppMessage('Por favor, preencha todos os campos.', 'error'); return; }
    if (password.length < 6) { showAppMessage('A senha deve ter no mínimo 6 caracteres.', 'error'); return; }
    showLoading("Cadastrando usuário...");
    try {
      const { data: existingFullName, error: fullNameCheckError } = await supabase
        .from('profiles').select('full_name').eq('full_name', fullName).single();
      if (fullNameCheckError && fullNameCheckError.code !== 'PGRST116') throw fullNameCheckError;
      if (existingFullName) { showAppMessage('Nome de exibição já usado.', 'error'); hideLoading(); return; }
      const { data: existingUsername, error: usernameCheckError } = await supabase
        .from('profiles').select('username').eq('username', username).single();
      if (usernameCheckError && usernameCheckError.code !== 'PGRST116') throw usernameCheckError;
      if (existingUsername) { showAppMessage('Nome de usuário indisponível.', 'error'); hideLoading(); return; }
      const fakeEmail = `${username}@filefacul.local`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: fakeEmail, password: password, options: { data: { full_name: fullName, username: username } }
      });
      if (signUpError) throw signUpError;
      console.log("Usuário cadastrado:", data);
      showAppMessage('Cadastro realizado!', 'success');
      if (loginContainer && signupContainer) { loginContainer.style.display = 'block'; signupContainer.style.display = 'none'; }
    } catch (e: any) {
      console.error("Erro no cadastro:", e);
      if (e.message.includes("User already registered") || e.message.includes("profiles_username_key")) {
        showAppMessage('Nome de usuário indisponível.', 'error');
      } else if (e.message.includes("profiles_full_name_unique")) {
        showAppMessage('Nome de exibição já usado.', 'error');
      } else { showAppMessage(`Erro no cadastro: ${e.message}`, 'error'); }
    } finally { hideLoading(); }
  });
  logoutButton.addEventListener('click', async (_event) => {
    await supabase.auth.signOut();
    showAppMessage('Você saiu.', 'info');
  });
  uploadForm.addEventListener('submit', handleUpload);

  fileList.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const itemDiv = (event.target as HTMLElement).closest('.file-item') as HTMLElement | null;
    if (!itemDiv) return;

    const isFolder = itemDiv.classList.contains('folder-item');
    const itemId = isFolder ? itemDiv.dataset.folderId : itemDiv.dataset.fileId;
    const itemName = isFolder
      ? itemDiv.querySelector('.folder-name-display')?.textContent ?? undefined
      : itemDiv.querySelector('.item-name')?.textContent ?? undefined;

    const ownerId = isFolder ? itemDiv.dataset.ownerId : itemDiv.dataset.uploaderId;
    console.log(ownerId);

    showItemActionsModal({
      isFolder,
      itemId,
      itemName,
      itemDiv
    });
  });

  function showItemActionsModal(args: {
    isFolder: boolean,
    itemId: string | undefined,
    itemName: string | undefined,
    itemDiv: HTMLElement
  }) {
    const overlay = document.getElementById('item-actions-modal-overlay') as HTMLDivElement;
    const modal = document.getElementById('item-actions-modal') as HTMLDivElement;
    const buttonsDiv = document.getElementById('item-actions-buttons') as HTMLDivElement;
    const title = document.getElementById('item-actions-title') as HTMLHeadingElement;
    const cancelBtn = document.getElementById('item-actions-cancel') as HTMLButtonElement;

    if (!overlay || !modal || !buttonsDiv || !title || !cancelBtn) return;

    title.textContent = args.itemName ? `Ações para "${args.itemName}"` : 'Ações';

    buttonsDiv.style.gap = '1rem';
    title.textContent = args.itemName ? `Ações para "${args.itemName}"` : 'Ações';
    buttonsDiv.innerHTML = '';

    if (!args.isFolder) {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-button';
      downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:24px;height:24px;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Baixar`;
      downloadBtn.onclick = () => {
        const downloadLink = args.itemDiv.querySelector('.download-button') as HTMLAnchorElement;
        if (downloadLink) downloadLink.click();
        overlay.classList.remove('visible');
        document.getElementById('app')?.classList.remove('app-blurred');
      };
      buttonsDiv.appendChild(downloadBtn);

      const currentLoggedInUserId = session!.user.id;
      const uploaderId = args.itemDiv.dataset.uploaderId;

      if (uploaderId === currentLoggedInUserId) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'excluir';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg> Deletar`;
        deleteBtn.onclick = async () => {
          overlay.classList.remove('visible');
          document.getElementById('app')?.classList.remove('app-blurred');
          const fileId = args.itemId;
          const storagePath = args.itemDiv.dataset.storagePath;
          if (fileId && storagePath) {
            const confirmed = await showCustomConfirm('Tem certeza que deseja deletar este ARQUIVO? Esta ação é irreversível.');
            if (confirmed) {
              await handleDeleteFile(fileId, storagePath);
            }
          }
        };
        buttonsDiv.appendChild(deleteBtn);
      }
    }

    if (args.isFolder) {
      const currentLoggedInUserId = session!.user.id;
      const ownerId = args.itemDiv.dataset.ownerId;

      if (ownerId === currentLoggedInUserId) {
        const renameBtn = document.createElement('button');
        renameBtn.className = 'rename-folder-button';
        renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg> Renomear`;
        renameBtn.onclick = () => {
          overlay.classList.remove('visible');
          document.getElementById('app')?.classList.remove('app-blurred');
          const renameOverlay = document.getElementById('rename-folder-modal-overlay')!;
          const input = document.getElementById('rename-folder-input') as HTMLInputElement;
          renameOverlay.classList.add('visible');
          input.value = args.itemName || '';
          input.focus();
          input.setSelectionRange(0, input.value.length);
          renameOverlay.setAttribute('data-folder-id', args.itemId || '');
        };
        buttonsDiv.appendChild(renameBtn);
      } else {
        const messageP = document.createElement('p');
        messageP.className = 'not-owner-message';
        messageP.textContent = 'Você não é o proprietário desta pasta';
        buttonsDiv.appendChild(messageP);
      }
    }

    if (args.isFolder) {
      const currentLoggedInUserId = session!.user.id;
      const ownerId = args.itemDiv.dataset.ownerId;

      if (ownerId === currentLoggedInUserId) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-button';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg> Deletar`;
        deleteBtn.onclick = async () => {
          overlay.classList.remove('visible');
          document.getElementById('app')?.classList.remove('app-blurred');
          if (args.itemId) {
            await handleAttemptDeleteFolder(args.itemId);
          }
        };
        buttonsDiv.appendChild(deleteBtn);
      }
    }

    cancelBtn.onclick = () => {
      overlay.classList.remove('visible');
      document.getElementById('app')?.classList.remove('app-blurred');
    };

    overlay.classList.add('visible');
    document.getElementById('app')?.classList.add('app-blurred');
  }

  window.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement).closest('.file-actions')) {
      document.querySelectorAll('.file-actions.visible').forEach(menu => {
        menu.classList.remove('visible');
      });
    }
  });

  fileList.removeEventListener('touchstart', handleTouchStart);
  fileList.removeEventListener('touchend', handleTouchEnd);
  fileList.removeEventListener('touchmove', handleTouchMove);

  function handleTouchStart(event: TouchEvent) {
    const itemDiv = (event.target as HTMLElement).closest('.file-item');
    if (!itemDiv) return;

    pressTimer = window.setTimeout(() => {
      pressTimer = null;

      event.preventDefault();

      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }

      const isFolder = itemDiv.classList.contains('folder-item');
      const itemId = isFolder ? (itemDiv as HTMLElement).dataset.folderId : (itemDiv as HTMLElement).dataset.fileId;
      const itemName = itemDiv.querySelector('.item-name')?.textContent ?? undefined;

      showItemActionsModal({
        isFolder,
        itemId,
        itemName,
        itemDiv: itemDiv as HTMLElement
      });

    }, 500);
  }

  function handleTouchEnd() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function handleTouchMove() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  fileList.addEventListener('touchstart', handleTouchStart, { passive: false });
  fileList.addEventListener('touchend', handleTouchEnd);
  fileList.addEventListener('touchmove', handleTouchMove);

  fileList.addEventListener('click', async (event) => {
    let target = event.target as HTMLElement;
    const clickableItem = target.closest('.file-item');
    if (!clickableItem) return;

    const renameBtn = target.closest('.rename-folder-button');
    if (renameBtn) {
      const folderId = renameBtn.getAttribute('data-folder-id');
      const currentName = renameBtn.getAttribute('data-current-name');
      const overlay = document.getElementById('rename-folder-modal-overlay')!;
      const input = document.getElementById('rename-folder-input') as HTMLInputElement;
      overlay.classList.add('visible');
      input.value = currentName || '';
      input.focus();
      input.setSelectionRange(0, input.value.length);
      overlay.setAttribute('data-folder-id', folderId || '');
      return;
    }

    if (target.classList.contains('cancel-rename-button')) {
      const folderInfoDiv = clickableItem.querySelector('.file-info');
      const nameSpan = folderInfoDiv?.querySelector('.folder-name-display') as HTMLElement;
      const renameForm = folderInfoDiv?.querySelector('.rename-form') as HTMLFormElement;
      if (nameSpan && renameForm) {
        clickableItem.classList.remove('is-renaming');
        nameSpan.style.display = 'block';
        renameForm.style.display = 'none';
      }
      return;
    }

    const deleteBtn = target.closest('.delete-button');
    if (deleteBtn && deleteBtn.tagName === 'BUTTON') {
      const folderId = (deleteBtn as HTMLElement).dataset.folderId;
      if (folderId) {
        await handleAttemptDeleteFolder(folderId);
      }
      return;
    }

    if (clickableItem.classList.contains('folder-item') && !clickableItem.classList.contains('is-renaming')) {
      const folderId = (clickableItem as HTMLElement).dataset.folderId;
      if (folderId) {
        if (!target.closest('button')) {
          displayItemsInCurrentFolder(folderId);
        }
      }
    }
  });

  fileList.addEventListener('submit', (event) => {
    const form = event.target as HTMLElement;
    if (form.classList.contains('rename-form')) {
      event.preventDefault();
      const input = form.querySelector('input') as HTMLInputElement;
      const newName = input.value;
      const itemDiv = form.closest('.file-item') as HTMLElement | null;
      const folderId = itemDiv?.dataset.folderId;

      if (folderId && newName) {
        handleAttemptRenameFolder(folderId, newName, form as HTMLFormElement);
      }
    }
  });

  createFolderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const folderName = folderNameInput.value;

    showTimedLoader("Criando pasta...", 3000);

    const result = await handleCreateFolder(folderName, session, currentFolderId);

    if (result.success) {
      showAppMessage('Pasta criada!', 'success');
      folderNameInput.value = '';
      displayItemsInCurrentFolder(currentFolderId);
    } else {
      showAppMessage(`Erro: ${result.error || 'Desconhecido'}`, 'error');
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput?.files && fileInput.files.length > 0) {
      const fileName = fileInput.files[0].name;
      fileInputText.textContent = fileName;
      fileInputLabel.classList.add('file-selected');
      iconAddFile.style.display = 'none';
      iconFileSelected.style.display = 'block';
    } else {
      resetFileInputLabel();
    }
  });

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (!newSession) { currentFolderId = null; }
    updateView();
  });

  const renameFolderModalOverlay = document.getElementById('rename-folder-modal-overlay')!;
  const renameFolderForm = document.getElementById('rename-folder-form') as HTMLFormElement;
  const renameFolderInput = document.getElementById('rename-folder-input') as HTMLInputElement;
  const renameFolderCancel = document.getElementById('rename-folder-cancel') as HTMLButtonElement;

  renameFolderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const folderId = renameFolderModalOverlay.getAttribute('data-folder-id');
    const newName = renameFolderInput.value.trim();
    if (folderId && newName) {
      handleAttemptRenameFolder(folderId, newName, renameFolderForm);
      renameFolderModalOverlay.classList.remove('visible');
    }
  });

  renameFolderCancel.addEventListener('click', () => {
    renameFolderModalOverlay.classList.remove('visible');
  });

});