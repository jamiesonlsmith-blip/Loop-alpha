/* Loop automatic app updates: no uninstall, no storage deletion.
 * Installs updates at safe idle moments or offers a visible Update now action.
 * New server deployments are detected even when the SW script did not change.
 */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  const CHECK_INTERVAL_MS = 30 * 60 * 1000;
  const FOREGROUND_CHECK_MS = 2 * 60 * 1000;
  let registration = null;
  let loadedDeployment = null;
  let lastCheckAt = 0;
  let checking = null;
  let updateReady = false;
  let postponed = false;
  let activationRequested = false;
  let reloadScheduled = false;

  function isEditing() {
    const active = document.activeElement;
    if (!active) return false;
    return active.matches('input:not([type=button]):not([type=submit]),textarea,select') ||
      active.isContentEditable;
  }

  function idleOnHome() {
    if (document.visibilityState === 'hidden' || isEditing()) return false;
    if (document.querySelector('dialog[open], .drawer.open, .scrim.open')) return false;
    const home = document.getElementById('home');
    if (!home || home.style.display === 'none') return false;
    // Never interrupt an active category search, result detail or member action.
    return !document.querySelector('.category-page.active,.community-page.active,.place-page.active,' +
      '.profile.active,.settings-page.active,.messenger-page.active,.activity-page.active');
  }

  function updateSettingsLabel(copy) {
    const node = document.getElementById('loopUpdateStatus');
    if (node) node.textContent = copy;
  }

  function clearBanner() {
    document.getElementById('loopUpdateBanner')?.remove();
  }

  function offerUpdate() {
    if (postponed || document.getElementById('loopUpdateBanner')) return;
    const banner = document.createElement('aside');
    banner.id = 'loopUpdateBanner';
    banner.className = 'loop-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const text = document.createElement('div');
    text.innerHTML = '<strong>Fresh Loop update ready</strong><small>Get the latest improvements without reinstalling.</small>';
    const actions = document.createElement('div');
    actions.className = 'loop-update-actions';
    const now = document.createElement('button');
    now.type = 'button'; now.textContent = 'Update now';
    now.addEventListener('click', () => applyUpdate(true));
    const later = document.createElement('button');
    later.type = 'button'; later.textContent = 'Later'; later.className = 'loop-update-later';
    later.addEventListener('click', () => {
      postponed = true;clearBanner();
      updateSettingsLabel('Update ready · scheduled for your next visit');
    });
    actions.append(now,later);banner.append(text,actions);
    document.body.appendChild(banner);
  }

  function applyUpdate(force = false) {
    if (!updateReady || postponed || (!force && !idleOnHome())) {
      if (!postponed) offerUpdate();
      return;
    }
    clearBanner();
    activationRequested = true;
    if (registration?.waiting && navigator.serviceWorker.controller) {
      registration.waiting.postMessage({type:'LOOP_APPLY_UPDATE'});
      return;
    }
    // When only HTML/server code changed, a fresh navigation is sufficient.
    window.location.reload();
  }

  function scheduleSafeUpdate() {
    if (!updateReady || postponed || reloadScheduled) return;
    if (!idleOnHome()) { offerUpdate();return; }
    reloadScheduled = true;
    setTimeout(() => {
      reloadScheduled = false;
      if (!postponed && updateReady) applyUpdate(false);
    }, 1200);
  }

  function discoveredUpdate() {
    if (updateReady) return;
    updateReady = true;
    updateSettingsLabel('New update ready · no reinstall needed');
    scheduleSafeUpdate();
  }

  function watchInstalling(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) discoveredUpdate();
    });
  }

  async function checkDeployment() {
    try {
      const response = await fetch('/api/app-version', {cache:'no-store',headers:{Accept:'application/json'}});
      if (!response.ok) return;
      const data = await response.json();
      const version = typeof data.version === 'string' && data.version.length > 6 ? data.version : null;
      if (!version) return;
      if (loadedDeployment && loadedDeployment !== version) discoveredUpdate();
      else if (!loadedDeployment) loadedDeployment = version;
    } catch {
      // Offline operation remains available from the service-worker cache.
    }
  }

  async function checkForUpdates(force = false) {
    if (checking) return checking;
    if (!navigator.onLine) {
      if (force) updateSettingsLabel('Offline · updates will resume when connected');
      return;
    }
    const now = Date.now();
    if (!force && now - lastCheckAt < FOREGROUND_CHECK_MS) return;
    lastCheckAt = now;
    checking = (async () => {
      try {
        if (registration) await registration.update();
      } catch (error) {
        console.info('Loop update check postponed', error?.message || error);
      }
      if (registration?.waiting && navigator.serviceWorker.controller) discoveredUpdate();
      await checkDeployment();
      if (force && !updateReady) updateSettingsLabel('Up to date · checks happen automatically');
      checking = null;
    })();
    return checking;
  }

  async function initializeUpdater() {
    try {
      // A fresh release response gives us a reference for foreground comparisons.
      await checkDeployment();
      registration = await navigator.serviceWorker.register('/sw.js', {updateViaCache:'none'});
      registration.addEventListener('updatefound', () => watchInstalling(registration.installing));
      watchInstalling(registration.installing);
      if (registration.waiting && navigator.serviceWorker.controller) discoveredUpdate();
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (activationRequested) window.location.reload();
        else if (!postponed) {
          updateReady = true;
          scheduleSafeUpdate();
        }
      });
      await checkForUpdates();
      updateSettingsLabel(updateReady ? 'Update ready · no reinstall needed' :
        'Automatically checks for app updates');
    } catch (error) {
      console.info('Loop auto-updates not yet available', error?.message || error);
      updateSettingsLabel('Updates available when connected');
    }
  }

  window.LoopAutoUpdate = {
    checkNow: () => checkForUpdates(true),
    getStatus: () => ({updateReady,postponed,registered:Boolean(registration)})
  };

  window.addEventListener('load', initializeUpdater, {once:true});
  window.addEventListener('focus', () => {checkForUpdates();scheduleSafeUpdate()});
  window.addEventListener('online', () => checkForUpdates(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {checkForUpdates();scheduleSafeUpdate()}
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') checkForUpdates();
  }, CHECK_INTERVAL_MS);
})();
