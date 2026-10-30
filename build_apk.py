#!/usr/bin/env python3
"""
Lumière Android APK Automated Builder
Compiles resources with aapt2, compiles Java with javac, generates DEX with d8,
zipaligns, signs with debug keystore, and verifies APK integrity.
"""

import os, sys, subprocess, zipfile, shutil

def build_apk():
    workspace = os.path.dirname(os.path.abspath(__file__))
    android_dir = os.path.join(workspace, 'android')
    build_dir = os.path.join(android_dir, 'build_tmp')
    shutil.rmtree(build_dir, ignore_errors=True)
    os.makedirs(build_dir, exist_ok=True)

    # Locate portable or system SDK/JDK
    java_home = os.environ.get('JAVA_HOME')
    candidate_jdk = r'C:\Users\Ayushman Mitra\.android_builder\jdk17'
    if not java_home or not os.path.exists(os.path.join(java_home, 'bin', 'javac.exe')):
        if os.path.exists(candidate_jdk):
            java_home = candidate_jdk

    candidate_sdk = r'C:\Users\Ayushman Mitra\.android_builder\sdk'
    android_home = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not android_home or not os.path.exists(android_home):
        if os.path.exists(candidate_sdk):
            android_home = candidate_sdk

    if not java_home or not android_home:
        print("Error: Could not locate JDK or Android SDK.")
        sys.exit(1)

    btools_root = os.path.join(android_home, 'build-tools')
    available_btools = sorted(os.listdir(btools_root)) if os.path.exists(btools_root) else []
    if not available_btools:
        print("Error: No build-tools found in", btools_root)
        sys.exit(1)
    btools = os.path.join(btools_root, available_btools[-1])

    platforms_root = os.path.join(android_home, 'platforms')
    available_platforms = sorted(os.listdir(platforms_root)) if os.path.exists(platforms_root) else []
    if not available_platforms:
        print("Error: No platforms found in", platforms_root)
        sys.exit(1)
    platform_jar = os.path.join(platforms_root, available_platforms[-1], 'android.jar')

    keystore = os.path.join(os.path.dirname(android_home), 'debug.keystore')
    if not os.path.exists(keystore):
        # Generate debug keystore
        keytool = os.path.join(java_home, 'bin', 'keytool.exe')
        subprocess.run([
            keytool, '-genkeypair', '-v', '-keystore', keystore,
            '-storepass', 'android', '-alias', 'androiddebugkey',
            '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048',
            '-validity', '10000', '-dname', 'CN=Lumiere,O=AyushmanMitra,C=IN'
        ], check=True)

    env = os.environ.copy()
    env['JAVA_HOME'] = java_home
    env['ANDROID_HOME'] = android_home
    env['PATH'] = os.path.join(java_home, 'bin') + ';' + env.get('PATH', '')

    aapt2 = os.path.join(btools, 'aapt2.exe' if os.name == 'nt' else 'aapt2')
    d8 = os.path.join(btools, 'd8.bat' if os.name == 'nt' else 'd8')
    zipalign = os.path.join(btools, 'zipalign.exe' if os.name == 'nt' else 'zipalign')
    apksigner = os.path.join(btools, 'apksigner.bat' if os.name == 'nt' else 'apksigner')
    javac = os.path.join(java_home, 'bin', 'javac.exe' if os.name == 'nt' else 'javac')

    res_dir = os.path.join(android_dir, 'app', 'src', 'main', 'res')
    manifest = os.path.join(android_dir, 'app', 'src', 'main', 'AndroidManifest.xml')
    java_src = os.path.join(android_dir, 'app', 'src', 'main', 'java', 'com', 'ayushman', 'lumiere')

    gen_dir = os.path.join(build_dir, 'gen')
    classes_dir = os.path.join(build_dir, 'classes')
    dex_dir = os.path.join(build_dir, 'dex')
    os.makedirs(gen_dir, exist_ok=True)
    os.makedirs(classes_dir, exist_ok=True)
    os.makedirs(dex_dir, exist_ok=True)

    compiled_res = os.path.join(build_dir, 'compiled_res.zip')
    unaligned_apk = os.path.join(build_dir, 'unaligned.apk')
    aligned_apk = os.path.join(build_dir, 'aligned.apk')
    final_apk = os.path.join(build_dir, 'lumiere.apk')

    print('[1/8] Compiling resources with aapt2...')
    res = subprocess.run([aapt2, 'compile', '--dir', res_dir, '-o', compiled_res], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print('aapt2 compile error:', res.stderr)
        sys.exit(1)

    print('[2/8] Linking APK and generating R.java...')
    res = subprocess.run([aapt2, 'link', '-I', platform_jar, compiled_res, '--manifest', manifest, '--java', gen_dir, '-o', unaligned_apk, '--auto-add-overlay'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print('aapt2 link error:', res.stderr)
        sys.exit(1)

    print('[3/8] Compiling Java source with javac...')
    java_files = [os.path.join(java_src, f) for f in os.listdir(java_src) if f.endswith('.java')]
    r_java = os.path.join(gen_dir, 'com', 'ayushman', 'lumiere', 'R.java')
    res = subprocess.run([javac, '-cp', f'{platform_jar};{gen_dir}', '-d', classes_dir] + java_files + [r_java], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print('javac error:', res.stderr)
        sys.exit(1)

    print('[4/8] Compiling bytecode to DEX with d8...')
    class_files = []
    for root, dirs, files in os.walk(classes_dir):
        for f in files:
            if f.endswith('.class'):
                class_files.append(os.path.join(root, f))
    res = subprocess.run([d8, '--lib', platform_jar, '--output', dex_dir] + class_files, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    if res.returncode != 0:
        print('d8 error:', res.stderr)
        sys.exit(1)

    print('[5/8] Injecting classes.dex into APK...')
    classes_dex = os.path.join(dex_dir, 'classes.dex')
    with zipfile.ZipFile(unaligned_apk, 'a') as z:
        z.write(classes_dex, 'classes.dex')

    print('[6/8] Aligning APK with zipalign...')
    res = subprocess.run([zipalign, '-p', '-f', '4', unaligned_apk, aligned_apk], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print('zipalign error:', res.stderr)
        sys.exit(1)

    print('[7/8] Signing APK with apksigner...')
    res = subprocess.run([apksigner, 'sign', '--ks', keystore, '--ks-pass', 'pass:android', '--out', final_apk, aligned_apk], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    if res.returncode != 0:
        print('apksigner error:', res.stderr)
        sys.exit(1)

    print('[8/8] Verifying APK signature...')
    res = subprocess.run([apksigner, 'verify', '--verbose', final_apk], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    if res.returncode != 0:
        print('Verification failed!')
        sys.exit(1)

    apk_size = os.path.getsize(final_apk)
    print(f'\n[SUCCESS] lumiere.apk created! ({apk_size:,} bytes, {apk_size/1024/1024:.2f} MB)')

    # Distribute to outputs
    shutil.copyfile(final_apk, os.path.join(workspace, 'lumiere.apk'))
    pub_dir = os.path.join(workspace, 'public')
    shutil.copyfile(final_apk, os.path.join(pub_dir, 'lumiere.apk'))
    release_dir = os.path.join(android_dir, 'app', 'build', 'outputs', 'apk', 'release')
    os.makedirs(release_dir, exist_ok=True)
    shutil.copyfile(final_apk, os.path.join(release_dir, 'lumiere-release.apk'))

    # Clean temporary build artifacts
    shutil.rmtree(build_dir, ignore_errors=True)
    print('Artifacts deployed to:')
    print(' -', os.path.join(workspace, 'lumiere.apk'))
    print(' -', os.path.join(pub_dir, 'lumiere.apk'))
    print(' -', os.path.join(release_dir, 'lumiere-release.apk'))

if __name__ == '__main__':
    build_apk()
